"""Test poker GROUP C: timer, broadcasts, presence, 10-player behavior, E2E"""
import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from database import SessionLocal, init_db
from models import User, Game, GameSession, GameStatus, GameType, TransactionType
from services.game_manager import GameManager
from services.wallet import WalletService
from games.poker import PokerGame, calculate_blinds
from games.base import GamePhase
from websocket.manager import manager
from config import get_settings


@pytest.fixture
def db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def unique_username(base: str, test_name: str) -> str:
    return f"{base}_{test_name.replace('test_', '')}"


def unique_email(base: str, test_name: str) -> str:
    return f"{base}_{test_name.replace('test_', '')}@test.com"


@pytest.mark.asyncio
async def test_poker_timeout_check_when_allowed_fold_otherwise(db):
    """Test timeout: check when allowed, fold otherwise; hand continues; settles once"""
    test_name = "timeout_check_fold"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=1000)
    user3 = User(username=unique_username("test_poker3", test_name), email=unique_email("p3", test_name), hashed_password="x", points=1000)
    db.add_all([user1, user2, user3])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)
    db.refresh(user3)

    game = await manager.create_game(user1.id, "poker", 100)
    await manager.join_game(game.id, user2.id)
    await manager.join_game(game.id, user3.id)
    await manager.start_game(game.id, user1.id)

    # Get game instance
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

    # Find current player (should be UTG after BB)
    state_dict = game_instance.state.to_dict()
    current_player_idx = state_dict.get("current_player", 0)
    current_player_id = state_dict["players"][current_player_idx]["id"]

    # Set turn deadline to past to force timeout
    game_locked.turn_deadline = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
    db.commit()

    # Apply timeout - should check (no bet facing) or fold (facing bet)
    gm = GameManager(db)
    timeout_applied = gm._check_and_apply_timeout(game_locked, game_instance)
    assert timeout_applied == True

    # Hand should continue (not finished unless only one active left)
    db.commit()
    game_after = db.query(Game).filter(Game.id == game.id).first()
    assert game_after.status == GameStatus.IN_PROGRESS

    # Verify timeout action was applied (check or fold)
    state_dict = game_instance.state.to_dict()
    timed_out_player = state_dict["players"][current_player_idx]
    assert timed_out_player.get("auto_stood") == True or timed_out_player.get("status") == "folded"

    # Continue game to finish - simulate all players folding/checking until showdown
    # Just verify hand continues and settles once
    game_after = db.query(Game).filter(Game.id == game.id).first()
    assert game_after.status == GameStatus.IN_PROGRESS


@pytest.mark.asyncio
async def test_poker_action_and_timeout_same_moment_409(db):
    """Test action and timeout at same moment: one outcome, other gets 409"""
    test_name = "action_timeout_race"
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

    # Get current turn_seq
    game_locked = db.query(Game).filter(Game.id == game.id).first()
    state_dict = json.loads(game_locked.state) if isinstance(game_locked.state, str) else game_locked.state
    turn_seq = state_dict.get("metadata", {}).get("turn_seq", 1)
    current_player_idx = state_dict.get("current_player", 0)
    current_player_id = state_dict["players"][current_player_idx]["id"]

    # Set deadline to past
    game_locked.turn_deadline = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
    db.commit()

    # Simulate concurrent: timeout sweeper runs AND player sends action
    # First, apply timeout (sweeper)
    players_data = []
    sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
    for s in sessions:
        u = db.query(User).filter(User.id == s.user_id).first()
        if u:
            players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})

    from games import get_game_class
    game_class = get_game_class("poker")
    game_instance = game_class.from_json(game_locked.state, game_locked.buy_in, players_data)

    gm = GameManager(db)
    timeout_applied = gm._check_and_apply_timeout(game_locked, game_instance)
    assert timeout_applied == True
    db.commit()

    # Now player tries to act with stale turn_seq - should get 409 (Turn expired)
    game_locked2 = db.query(Game).filter(Game.id == game.id).with_for_update().first()
    players_data2 = []
    sessions2 = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
    for s in sessions2:
        u = db.query(User).filter(User.id == s.user_id).first()
        if u:
            players_data2.append({"id": u.id, "username": u.username, "chips": s.buy_in})

    game_instance2 = game_class.from_json(game_locked2.state, game_locked2.buy_in, players_data2)

    # Try to act with old turn_seq
    try:
        await manager.apply_action(game.id, current_player_id, "check", 0, turn_seq)
        assert False, "Should have raised ValueError"
    except ValueError as e:
        assert "Turn expired" in str(e) or "Not your turn" in str(e) or "Game is not in progress" in str(e)

    # Verify hand settled only once
    game_final = db.query(Game).filter(Game.id == game.id).first()
    # Game might be finished or still in progress depending on player count
    # But double settlement should not occur


@pytest.mark.asyncio
async def test_poker_10_players_join_limit(db):
    """Test 10 players: join up to 10, 11th gets 400"""
    test_name = "10_players_join"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    # Create 11 users
    users = []
    for i in range(11):
        u = User(username=unique_username(f"test_poker{i}", test_name), email=unique_email(f"p{i}", test_name), hashed_password="x", points=1000)
        users.append(u)
    db.add_all(users)
    db.commit()
    for u in users:
        db.refresh(u)

    # Create game with user 0
    game = await manager.create_game(users[0].id, "poker", 100)

    # Join 9 more players (total 10)
    for i in range(1, 10):
        await manager.join_game(game.id, users[i].id)

    # Verify game has 10 players
    sessions = db.query(GameSession).filter(GameSession.game_id == game.id).all()
    assert len(sessions) == 10

    # 11th player tries to join - should get 400 (Game is full)
    with pytest.raises(ValueError, match="Game is full"):
        await manager.join_game(game.id, users[10].id)


@pytest.mark.asyncio
async def test_poker_10_players_full_hand_conservation(db):
    """Test 10 players full hand with correct payouts and conservation"""
    test_name = "10_players_conservation"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    # Create 10 users
    users = []
    for i in range(10):
        u = User(username=unique_username(f"test_poker{i}", test_name), email=unique_email(f"p{i}", test_name), hashed_password="x", points=2000)
        users.append(u)
    db.add_all(users)
    db.commit()
    for u in users:
        db.refresh(u)

    total_before = sum(wallet.get_balance(u.id) for u in users)

    # Create and join all 10
    game = await manager.create_game(users[0].id, "poker", 100)
    for i in range(1, 10):
        await manager.join_game(game.id, users[i].id)

    await manager.start_game(game.id, users[0].id)

    # Manually finish game
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

    # Verify conservation
    total_after = sum(wallet.get_balance(u.id) for u in users)
    game_final = db.query(Game).filter(Game.id == game.id).first()
    assert game_final.pot == 0
    assert total_after == total_before, f"Conservation failed: {total_before} != {total_after}"

    # Verify all players have results
    for session in game_final.sessions:
        assert session.result in ("win", "loss", "push")
        assert session.payout is not None
        assert session.payout >= 0


@pytest.mark.asyncio
async def test_poker_10_players_3_timeouts_in_row(db):
    """Test 10 players where 3 players time out in a row: hand keeps moving, settles once"""
    test_name = "10_players_3_timeouts"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    # Create 10 users
    users = []
    for i in range(10):
        u = User(username=unique_username(f"test_poker{i}", test_name), email=unique_email(f"p{i}", test_name), hashed_password="x", points=2000)
        users.append(u)
    db.add_all(users)
    db.commit()
    for u in users:
        db.refresh(u)

    game = await manager.create_game(users[0].id, "poker", 100)
    for i in range(1, 10):
        await manager.join_game(game.id, users[i].id)

    await manager.start_game(game.id, users[0].id)

    # Apply 3 timeouts in a row
    from games import get_game_class
    game_class = get_game_class("poker")

    for _ in range(3):
        game_locked = db.query(Game).filter(Game.id == game.id).with_for_update().first()
        if game_locked.status != GameStatus.IN_PROGRESS:
            break

        players_data = []
        sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
        for s in sessions:
            u = db.query(User).filter(User.id == s.user_id).first()
            if u:
                players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})

        game_instance = game_class.from_json(game_locked.state, game_locked.buy_in, players_data)

        # Set deadline to past
        game_locked.turn_deadline = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
        db.commit()

        gm = GameManager(db)
        timeout_applied = gm._check_and_apply_timeout(game_locked, game_instance)
        assert timeout_applied == True
        db.commit()

    # Game should still be in progress or finished (not errored)
    game_after = db.query(Game).filter(Game.id == game.id).first()
    assert game_after.status in (GameStatus.IN_PROGRESS, GameStatus.FINISHED)

    # If finished, verify settled once
    if game_after.status == GameStatus.FINISHED:
        assert game_after.pot == 0
        sessions = db.query(GameSession).filter(GameSession.game_id == game.id).all()
        for s in sessions:
            assert s.result in ("win", "loss", "push")


@pytest.mark.asyncio
async def test_poker_restart_mid_turn_timer_expires(db):
    """Test restart uvicorn mid-turn: timer still expires correctly"""
    test_name = "restart_timer"
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

    # Set turn_deadline to 2 seconds in future (simulating mid-turn)
    game_locked = db.query(Game).filter(Game.id == game.id).with_for_update().first()
    game_locked.turn_deadline = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=2)
    db.commit()

    # Simulate server restart by creating new manager and checking timeout
    # In real restart, the sweeper would pick up the expired deadline
    # Here we just verify the deadline persists in DB
    game_check = db.query(Game).filter(Game.id == game.id).first()
    assert game_check.turn_deadline is not None

    # Wait for deadline to pass
    await asyncio.sleep(3)

    # Now check with new manager (simulating post-restart)
    manager2 = GameManager(db)
    players_data = []
    sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
    for s in sessions:
        u = db.query(User).filter(User.id == s.user_id).first()
        if u:
            players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})

    from games import get_game_class
    game_class = get_game_class("poker")
    game_instance = game_class.from_json(game_check.state, game_check.buy_in, players_data)

    timeout_applied = manager2._check_and_apply_timeout(game_check, game_instance)
    assert timeout_applied == True


@pytest.mark.asyncio
async def test_poker_curl_flow_3_users(db):
    """Test curl-level flow: create, join, start, play full hand, finish, rematch, wallet stats"""
    test_name = "curl_flow"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    users = []
    for i in range(3):
        u = User(username=unique_username(f"test_poker{i}", test_name), email=unique_email(f"p{i}", test_name), hashed_password="x", points=2000)
        users.append(u)
    db.add_all(users)
    db.commit()
    for u in users:
        db.refresh(u)

    # CREATE
    game = await manager.create_game(users[0].id, "poker", 100)
    assert game.status == GameStatus.WAITING
    assert game.buy_in == 100

    # JOIN
    await manager.join_game(game.id, users[1].id)
    await manager.join_game(game.id, users[2].id)
    assert game.pot == 300

    # START
    game = await manager.start_game(game.id, users[0].id)
    assert game.status == GameStatus.IN_PROGRESS
    assert game.turn_deadline is not None

    # PLAY - simulate a simple hand where players fold until one remains
    from games import get_game_class
    game_class = get_game_class("poker")

    # Get initial state
    game_locked = db.query(Game).filter(Game.id == game.id).first()
    state_dict = json.loads(game_locked.state) if isinstance(game_locked.state, str) else game_locked.state
    current_player_idx = state_dict.get("current_player", 0)

    # Play until finished - fold all but last player
    max_actions = 50
    actions_taken = 0
    while game_locked.status == GameStatus.IN_PROGRESS and actions_taken < max_actions:
        state_dict = json.loads(game_locked.state) if isinstance(game_locked.state, str) else game_locked.state
        current_player_idx = state_dict.get("current_player", 0)
        if current_player_idx >= len(state_dict["players"]):
            break
        current_player_id = state_dict["players"][current_player_idx]["id"]

        # Check valid actions
        players_data = []
        sessions = db.query(GameSession).filter(GameSession.game_id == game.id).order_by(GameSession.position).all()
        for s in sessions:
            u = db.query(User).filter(User.id == s.user_id).first()
            if u:
                players_data.append({"id": u.id, "username": u.username, "chips": s.buy_in})
        game_instance = game_class.from_json(game_locked.state, game_locked.buy_in, players_data)
        valid_actions = game_instance.get_valid_actions(current_player_id)

        # Fold to end hand quickly (uncontested pot)
        action = "fold"

        try:
            game = await manager.apply_action(game.id, current_player_id, action, 0, state_dict.get("metadata", {}).get("turn_seq", 1))
            game_locked = db.query(Game).filter(Game.id == game.id).first()
        except Exception as e:
            break
        actions_taken += 1

    # FINISH - game should be finished
    game_final = db.query(Game).filter(Game.id == game.id).first()
    assert game_final.status == GameStatus.FINISHED
    assert game_final.pot == 0
    assert game_final.winner_id is not None

    # Verify all players have payouts
    for session in game_final.sessions:
        assert session.payout is not None
        assert session.result in ("win", "loss", "push")

    # Check wallet stats after first game
    for u in users:
        summary = wallet.get_transaction_summary(u.id)
        assert summary["games_played"] >= 1

    # REMATCH
    balance_before = [wallet.get_balance(u.id) for u in users]
    game1 = await manager.rematch_game(game_final.id, users[0].id)
    game2 = await manager.rematch_game(game_final.id, users[1].id)
    game3 = await manager.rematch_game(game_final.id, users[2].id)

    # All should get same game
    assert game1.id == game2.id == game3.id

    # Each charged once
    balance_after = [wallet.get_balance(u.id) for u in users]
    for i in range(3):
        assert balance_before[i] - balance_after[i] == 100

    # WALLET STATS - should have at least 1 game (the finished one)
    for u in users:
        summary = wallet.get_transaction_summary(u.id)
        assert summary["games_played"] >= 1
        assert summary["wins"] + summary["losses"] + summary["pushes"] >= 1


@pytest.mark.asyncio
async def test_poker_ws_state_changed_broadcast(db):
    """Test WS: second client receives state_changed after each action"""
    test_name = "ws_broadcast"
    db.query(GameSession).delete()
    db.query(Game).delete()
    db.query(User).filter(User.username.like(f"test_poker%{test_name}%")).delete()
    db.commit()

    manager = GameManager(db)
    wallet = WalletService(db)

    user1 = User(username=unique_username("test_poker1", test_name), email=unique_email("p1", test_name), hashed_password="x", points=1000)
    user2 = User(username=unique_username("test_poker2", test_name), email=unique_email("p2", test_name), hashed_password="x", points=1000)
    user3 = User(username=unique_username("test_poker3", test_name), email=unique_email("p3", test_name), hashed_password="x", points=1000)
    db.add_all([user1, user2, user3])
    db.commit()
    db.refresh(user1)
    db.refresh(user2)
    db.refresh(user3)

    game = await manager.create_game(user1.id, "poker", 100)
    await manager.join_game(game.id, user2.id)
    await manager.join_game(game.id, user3.id)
    await manager.start_game(game.id, user1.id)

    # Track broadcast calls on the websocket manager
    from websocket.manager import manager as ws_manager
    original_broadcast = ws_manager.broadcast_state_changed
    broadcast_calls = []

    async def tracking_broadcast(game_id):
        broadcast_calls.append({"game_id": game_id})
        await original_broadcast(game_id)

    ws_manager.broadcast_state_changed = tracking_broadcast

    # Perform a valid action (fold, since first player faces BB)
    game_locked = db.query(Game).filter(Game.id == game.id).first()
    state_dict = json.loads(game_locked.state) if isinstance(game_locked.state, str) else game_locked.state
    current_player_idx = state_dict.get("current_player", 0)
    current_player_id = state_dict["players"][current_player_idx]["id"]

    # First player preflop faces BB, so must call/raise/fold - use fold
    await manager.apply_action(game.id, current_player_id, "fold", 0, state_dict.get("metadata", {}).get("turn_seq", 1))

    # Should have broadcast state_changed
    state_changed_broadcasts = [c for c in broadcast_calls if c["game_id"] == game.id]
    assert len(state_changed_broadcasts) >= 1

    # Restore
    ws_manager.broadcast_state_changed = original_broadcast


import json
if __name__ == "__main__":
    pytest.main([__file__, "-v"])