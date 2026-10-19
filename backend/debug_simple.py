from database import SessionLocal
from models import Transaction, User, Game, GameSession, GameStatus
from services.wallet import WalletService

db = SessionLocal()
try:
    user = db.query(User).filter(User.username == "liavin").first()
    wallet = WalletService(db)
    summary = wallet.get_transaction_summary(user.id)
    print("SUMMARY:", summary)
    
    sessions = db.query(GameSession).join(Game).filter(
        GameSession.user_id == user.id, Game.status == GameStatus.FINISHED
    ).all()
    for s in sessions:
        net = s.payout - s.buy_in
        print(f"G{s.game_id}: buy={s.buy_in} pay={s.payout} res={s.result} net={net}")
finally:
    db.close()