from database import SessionLocal
from models import Transaction, User, Game, GameSession, GameStatus, TransactionType
from sqlalchemy import func, case
from services.wallet import WalletService

db = SessionLocal()
try:
    user = db.query(User).filter(User.username == "liavin").first()
    print(f"User: {user.username} (id={user.id}), points={user.points}")
    
    # Current summary (from GameSession)
    wallet = WalletService(db)
    summary = wallet.get_transaction_summary(user.id)
    print("\n=== CURRENT SUMMARY (GameSession-based) ===")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    
    # Transaction-based summary (group by reference_id)
    print("\n=== TRANSACTION-BASED (group by reference_id) ===")
    txs = db.query(Transaction).filter(Transaction.user_id == user.id).all()
    
    # Group by reference_id
    by_game = {}
    for t in txs:
        ref = t.reference_id
        if ref is None:
            continue
        if ref not in by_game:
            by_game[ref] = {"debits": 0, "credits": 0, "txs": []}
        if t.amount < 0:
            by_game[ref]["debits"] += abs(t.amount)
        else:
            by_game[ref]["credits"] += t.amount
        by_game[ref]["txs"].append(t)
    
    # Filter to finished games only
    finished_game_ids = set()
    sessions = db.query(GameSession).join(Game).filter(
        GameSession.user_id == user.id, Game.status == GameStatus.FINISHED
    ).all()
    for s in sessions:
        finished_game_ids.add(s.game_id)
    
    print(f"Finished game IDs from GameSession: {sorted(finished_game_ids)}")
    print(f"Game IDs from transactions: {sorted(by_game.keys())}")
    
    tx_games_played = 0
    tx_wins = 0
    tx_losses = 0
    tx_pushes = 0
    tx_total_won = 0
    tx_total_lost = 0
    tx_biggest_win = 0
    
    for gid in sorted(finished_game_ids):
        if gid not in by_game:
            print(f"  Game {gid}: NO TRANSACTIONS WITH REFERENCE_ID")
            continue
        g = by_game[gid]
        debits = g["debits"]
        credits = g["credits"]
        net = credits - debits
        print(f"  Game {gid}: debits={debits}, credits={credits}, net={net}")
        print(f"    TXs: ", end="")
        for t in g["txs"]:
            print(f"[{t.type.value} {t.amount:+d}] ", end="")
        print()
        
        tx_games_played += 1
        if net > 0:
            tx_wins += 1
            tx_total_won += net
            tx_biggest_win = max(tx_biggest_win, net)
        elif net < 0:
            tx_losses += 1
            tx_total_lost += abs(net)
        else:
            tx_pushes += 1
    
    tx_net = tx_total_won - tx_total_lost
    tx_win_rate = int(round((tx_wins / tx_games_played) * 100)) if tx_games_played > 0 else 0
    
    print(f"\n  SUMMARY: games={tx_games_played}, wins={tx_wins}, losses={tx_losses}, pushes={tx_pushes}")
    print(f"  total_won={tx_total_won}, total_lost={tx_total_lost}, net={tx_net}, biggest_win={tx_biggest_win}, win_rate={tx_win_rate}%")
    
    # GameSession detail for finished games
    print("\n=== GAMESESSION DETAIL (finished only) ===")
    for s in sessions:
        game = db.query(Game).filter(Game.id == s.game_id).first()
        net = s.payout - s.buy_in
        print(f"  Game {s.game_id}: buy_in={s.buy_in}, payout={s.payout}, result={s.result}, net={net}")
    
    # Compare
    print("\n=== DISCREPANCY CHECK ===")
    gs_games = {s.game_id: s.payout - s.buy_in for s in sessions}
    tx_game_nets = {gid: by_game[gid]["credits"] - by_game[gid]["debits"] for gid in finished_game_ids if gid in by_game}
    
    for gid in sorted(finished_game_ids):
        gs_net = gs_games.get(gid, 0)
        tx_net_g = tx_game_nets.get(gid, 0)
        if gs_net != tx_net_g:
            print(f"  Game {gid}: GameSession net={gs_net}, Transaction net={tx_net_g} -> MISMATCH")
    
finally:
    db.close()