from database import SessionLocal
from models import Transaction, User, Game, GameSession, GameStatus, TransactionType
from sqlalchemy import func, case
from services.wallet import WalletService

db = SessionLocal()
try:
    # Check all users
    users = db.query(User).all()
    for user in users:
        print(f"\n=== User: {user.username} (id={user.id}) ===")
        
        # Current summary (GameSession-based)
        wallet = WalletService(db)
        summary = wallet.get_transaction_summary(user.id)
        print(f"Current summary: games={summary['games_played']}, wins={summary['wins']}, losses={summary['losses']}, pushes={summary['pushes']}, total_won={summary['total_won']}, total_lost={summary['total_lost']}, net={summary['net']}")
        
        # GameSession detail for finished games
        sessions = db.query(GameSession).join(Game).filter(
            GameSession.user_id == user.id, Game.status == GameStatus.FINISHED
        ).all()
        
        # Transaction-based (group by reference_id where exists)
        txs = db.query(Transaction).filter(Transaction.user_id == user.id).all()
        by_game = {}
        for t in txs:
            ref = t.reference_id
            if ref is None:
                continue
            if ref not in by_game:
                by_game[ref] = {"debits": 0, "credits": 0}
            if t.amount < 0:
                by_game[ref]["debits"] += abs(t.amount)
            else:
                by_game[ref]["credits"] += t.amount
        
        finished_game_ids = {s.game_id for s in sessions}
        mismatch_count = 0
        for s in sessions:
            gs_net = s.payout - s.buy_in
            tx_net = by_game.get(s.game_id, {}).get("credits", 0) - by_game.get(s.game_id, {}).get("debits", 0)
            # Only compare if transactions exist for this game
            if s.game_id in by_game and gs_net != tx_net:
                mismatch_count += 1
                print(f"  MISMATCH Game {s.game_id}: GS net={gs_net} (buy={s.buy_in}, pay={s.payout}), TX net={tx_net} (debits={by_game[s.game_id]['debits']}, credits={by_game[s.game_id]['credits']})")
        
        if mismatch_count == 0:
            print(f"  No mismatches for {len(sessions)} finished games")
        else:
            print(f"  Total mismatches: {mismatch_count} out of {len(sessions)} finished games")
        
        # Also check games with transactions but no GameSession (shouldn't happen)
        for gid in by_game:
            if gid not in finished_game_ids:
                game = db.query(Game).filter(Game.id == gid).first()
                if game and game.status == GameStatus.FINISHED:
                    print(f"  ORPHAN TX Game {gid}: has transactions but no GameSession for this user")

finally:
    db.close()