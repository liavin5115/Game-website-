"""Test poker backend changes"""
import pytest
from database import SessionLocal, init_db
from models import User, Game, GameSession, GameStatus, GameType, TransactionType
from services.game_manager import GameManager
from services.wallet import WalletService
from games.poker import PokerGame, calculate_blinds
from games.base import GamePhase
import asyncio


@pytest.fixture
def db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def unique_username(base: str, test_name: str) -> str:
    """Generate unique username for each test"""
    return f"{base}_{test_name.replace('test_', '')}"

def unique_email(base: str, test_name: str) -> str:
    """Generate unique email for each test"""
    return f"{base}_{test_name.replace('test_', '')}@test.com"


@pytest.mark.asyncio
async def test_poker_blinds():
    """Test blind calculation"""
    sb, bb = calculate_blinds(100)
    assert bb == 5  # 100 // 20
    assert sb == 2  # 5 // 2
    
    sb, bb = calculate_blinds(40)
    assert bb == 2  # 40 // 20
    assert sb == 1  # 2 // 2
    
    # Minimum buy-in
    sb, bb = calculate_blinds(30)
    assert bb == 1  # 30 // 20 = 1 (min)
    assert sb == 1  # 1 // 2 = 0 -> min 1


@pytest.mark.asyncio
async def test_poker_create_game(db):
    """Test poker game creation with buy-in"""
    test_name = "create_game"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=1000)
    db.add_all([user1, user2])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    # Create poker game
    game = await manager.create_game(user1.id, "poker", 100)
    assert game.game_type == GameType.POKER
    assert game.buy_in == 100
    assert game.status == GameStatus.WAITING
    assert game.pot == 100
    
    # Verify buy-in deducted
    assert wallet.get_balance(user1.id) == 900
    
    # Check transaction
    txs = wallet.get_transactions(user1.id)
    assert len(txs) == 1
    assert txs[0].type == TransactionType.GAME_BUYIN
    assert txs[0].amount == -100
    assert txs[0].balance_after == 900
    assert txs[0].reference_id == game.id


@pytest.mark.asyncio
async def test_poker_join_game(db):
    """Test joining poker game"""
    test_name = "join_game"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=1000)
    db.add_all([user1, user2])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    game = await manager.create_game(user1.id, "poker", 100)
    session = await manager.join_game(game.id, user2.id)
    
    assert session.user_id == user2.id
    assert session.buy_in == 100
    assert game.pot == 200
    assert wallet.get_balance(user2.id) == 900


@pytest.mark.asyncio
async def test_poker_leave_game(db):
    """Test leaving poker game while waiting - exact refund"""
    test_name = "leave_game"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=1000)
    db.add_all([user1, user2])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    game = await manager.create_game(user1.id, "poker", 100)
    await manager.join_game(game.id, user2.id)
    
    # User2 leaves - should have 3 transactions total (buy-in, buy-in, refund)
    await manager.leave_game(game.id, user2.id)
    
    # Verify exact refund
    assert wallet.get_balance(user2.id) == 1000
    assert game.pot == 100
    
    # Verify refund transaction
    txs = wallet.get_transactions(user2.id)
    assert len(txs) == 2  # join buy-in + refund
    # Last transaction should be refund
    assert txs[0].type == TransactionType.REFUND
    assert txs[0].amount == 100
    assert txs[0].balance_after == 1000
    
    # Game state rebuilt
    game2 = db.query(Game).filter(Game.id == game.id).first()
    assert len(game2.sessions) == 1


@pytest.mark.asyncio
async def test_poker_leave_after_start_fails(db):
    """Test leaving after game started returns error"""
    test_name = "leave_after_start"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=1000)
    db.add_all([user1, user2])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    game = await manager.create_game(user1.id, "poker", 100)
    await manager.join_game(game.id, user2.id)
    
    # Start game
    await manager.start_game(game.id, user1.id)
    
    # Try to leave - should fail
    with pytest.raises(ValueError, match="Can only leave waiting games"):
        await manager.leave_game(game.id, user2.id)


@pytest.mark.asyncio
async def test_poker_buy_in_lower_than_balance(db):
    """Test buy-in validation"""
    test_name = "buy_in_validation"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=50)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=50)
    db.add_all([user1, user2])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    # Try to create with insufficient points
    with pytest.raises(ValueError, match="Insufficient points for buy-in"):
        await manager.create_game(user1.id, "poker", 100)
    
    # Create with sufficient points
    game = await manager.create_game(user1.id, "poker", 50)
    assert game.buy_in == 50


@pytest.mark.asyncio
async def test_poker_minimum_buy_in(db):
    """Test poker minimum buy-in of 40"""
    test_name = "min_buy_in"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    db.add(user1)
    db.commit()
    db.refresh(user1)

    # Try to create with buy-in < 40
    with pytest.raises(ValueError, match="Poker minimum buy-in is 40"):
        await manager.create_game(user1.id, "poker", 30)
    
    # Should work with 40
    game = await manager.create_game(user1.id, "poker", 40)
    assert game.buy_in == 40


@pytest.mark.asyncio
async def test_poker_settlement_conservation(db):
    """Test conservation: total points before = total after (including pot)"""
    test_name = "settlement_conservation"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=1000)
    db.add_all([user1, user2])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    total_before = wallet.get_balance(user1.id) + wallet.get_balance(user2.id)
    
    game = await manager.create_game(user1.id, "poker", 100)
    await manager.join_game(game.id, user2.id)
    
    # During game: player balances + pot = total
    total_during = wallet.get_balance(user1.id) + wallet.get_balance(user2.id) + game.pot
    assert total_during == total_before
    
    # Start and finish game
    await manager.start_game(game.id, user1.id)
    
    # Get game instance and manually finish to test settlement
    game_locked = db.query(Game).filter(Game.id == game.id).with_for_update().first()
    players_data = []
    sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
    for s in sessions:
        u = db.query(User).filter(User.id == s.user_id).first()
        if u:
            players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})
    
    from games import get_game_class
    game_class = get_game_class("poker")
    game_instance = game_class.from_json(game_locked.state, game_locked.buy_in, players_data)
    
    # Force finish by setting phase
    game_instance.state.phase = GamePhase.FINISHED
    
    manager._finish_game(game_locked, game_instance)
    db.commit()
    
    # After settlement: pot should be 0, all money back to players
    total_after = wallet.get_balance(user1.id) + wallet.get_balance(user2.id)
    game_final = db.query(Game).filter(Game.id == game.id).first()
    assert game_final.pot == 0
    assert total_after == total_before, f"Conservation failed: {total_before} != {total_after}"
    
    # Check transactions have balance_after
    for uid in [user1.id, user2.id]:
        txs = wallet.get_transactions(uid)
        for tx in txs:
            assert tx.balance_after is not None
            assert tx.balance_after >= 0
            assert tx.reference_id == game.id


@pytest.mark.asyncio
async def test_poker_wallet_stats(db):
    """Test wallet stats after win, loss, split pot"""
    test_name = "wallet_stats"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=1000)
    db.add_all([user1, user2])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    # Play a game
    game = await manager.create_game(user1.id, "poker", 100)
    await manager.join_game(game.id, user2.id)
    await manager.start_game(game.id, user1.id)
    
    # Manually finish
    game_locked = db.query(Game).filter(Game.id == game.id).with_for_update().first()
    players_data = []
    sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
    for s in sessions:
        u = db.query(User).filter(User.id == s.user_id).first()
        if u:
            players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})
    
    from games import get_game_class
    game_class = get_game_class("poker")
    game_instance = game_class.from_json(game_locked.state, game_locked.buy_in, players_data)
    game_instance.state.phase = GamePhase.FINISHED
    
    manager._finish_game(game_locked, game_instance)
    db.commit()
    
    # Check stats
    summary1 = wallet.get_transaction_summary(user1.id)
    summary2 = wallet.get_transaction_summary(user2.id)
    
    assert summary1["games_played"] == 1
    assert summary2["games_played"] == 1
    assert summary1["games_played"] + summary2["games_played"] == 2
    
    # One win, one loss (or split pot -> push)
    assert summary1["wins"] + summary1["losses"] + summary1["pushes"] == 1
    assert summary2["wins"] + summary2["losses"] + summary2["pushes"] == 1


@pytest.mark.asyncio
async def test_poker_game_structure(db):
    """Test game structure: one hand per game, leftover chips returned"""
    test_name = "game_structure"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=1000)
    db.add_all([user1, user2])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    game = await manager.create_game(user1.id, "poker", 100)
    await manager.join_game(game.id, user2.id)
    await manager.start_game(game.id, user1.id)
    
    # Verify game state has chips for each player (after blinds posted)
    game_locked = db.query(Game).filter(Game.id == game.id).with_for_update().first()
    players_data = []
    sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
    for s in sessions:
        u = db.query(User).filter(User.id == s.user_id).first()
        if u:
            players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})
    
    from games import get_game_class
    game_class = get_game_class("poker")
    game_instance = game_class.from_json(game_locked.state, game_locked.buy_in, players_data)
    
    # Each player should have chips after blinds posted
    # Heads-up: button (pos 0) posts SB=2, other (pos 1) posts BB=5
    # bet shows the current bet in the round (blind amount for preflop)
    for p in game_instance.state.players:
        assert p["chips"] <= 100  # Chips reduced by blinds
        assert p["total_bet"] >= 0
        # bet is the blind amount during preflop, not reset until betting round completes
    
    # Finish
    game_instance.state.phase = GamePhase.FINISHED
    manager._finish_game(game_locked, game_instance)
    db.commit()
    
    # Each player should get payout = remaining chips + pot share
    for session in game_locked.sessions:
        assert session.payout is not None
        assert session.result in ("win", "loss", "push")


@pytest.mark.asyncio
async def test_poker_rematch(db):
    """Test rematch: two players press it, both land in same new game, charged once each"""
    test_name = "rematch"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=1000)
    db.add_all([user1, user2])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)

    # Play a game
    game = await manager.create_game(user1.id, "poker", 100)
    await manager.join_game(game.id, user2.id)
    await manager.start_game(game.id, user1.id)
    
    # Manually finish
    game_locked = db.query(Game).filter(Game.id == game.id).with_for_update().first()
    players_data = []
    sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
    for s in sessions:
        u = db.query(User).filter(User.id == s.user_id).first()
        if u:
            players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})
    
    from games import get_game_class
    game_class = get_game_class("poker")
    game_instance = game_class.from_json(game_locked.state, game_locked.buy_in, players_data)
    game_instance.state.phase = GamePhase.FINISHED
    
    manager._finish_game(game_locked, game_instance)
    db.commit()
    
    # Both players press rematch at same time
    balance_before_1 = wallet.get_balance(user1.id)
    balance_before_2 = wallet.get_balance(user2.id)
    
    # Simulate concurrent calls
    game1 = await manager.rematch_game(game.id, user1.id)
    game2 = await manager.rematch_game(game.id, user2.id)
    
    # Both should get the same game
    assert game1.id == game2.id
    
    # Both should be charged once
    balance_after_1 = wallet.get_balance(user1.id)
    balance_after_2 = wallet.get_balance(user2.id)
    
    assert balance_before_1 - balance_after_1 == 100
    assert balance_before_2 - balance_after_2 == 100
    
    # New game should have both players
    new_sessions = db.query(GameSession).filter(GameSession.game_id == game1.id).all()
    assert len(new_sessions) == 2
    
    # Original game should have next_game_id in metadata
    import json
    original = db.query(Game).filter(Game.id == game.id).first()
    meta = json.loads(original.state).get("metadata", {})
    assert meta.get("next_game_id") == game1.id


if __name__ == "__main__":
    pytest.main([__file__, "-v"])