from database import SessionLocal
from models import Transaction, User, Game, GameSession, GameStatus
from sqlalchemy import func

db = SessionLocal()
try:
    users = db.query(User).all()
    for u in users:
        print(f'User: {u.username} (id={u.id}), points={u.points}')
        txs = db.query(Transaction).filter(Transaction.user_id == u.id).order_by(Transaction.created_at).all()
        for t in txs:
            print(f'  TX: id={t.id}, type={t.type.value}, amount={t.amount}, balance_after={t.balance_after}, ref_id={t.reference_id}, desc={t.description}')
        sessions = db.query(GameSession).join(Game).filter(GameSession.user_id == u.id).all()
        for s in sessions:
            game = db.query(Game).filter(Game.id == s.game_id).first()
            print(f'  Session: game_id={s.game_id}, status={game.status.value if game else None}, buy_in={s.buy_in}, payout={s.payout}, result={s.result}')
        print()
finally:
    db.close()