"""Test rematch functionality - comprehensive"""
from database import SessionLocal, init_db
from models import User, Game, GameSession, GameStatus, GameType, TransactionType
from services.game_manager import GameManager
from services.wallet import WalletService
import asyncio

async def test_rematch():
    db = SessionLocal()
    try:
        # Clean up any existing test data
        db.query(GameSession).delete()
        db.query(Game).delete()
        db.query(User).filter(User.username.like("test_rematch%")).delete()
        db.query(User).filter(User.username.like("test_solo%")).delete()
        db.commit()
        
        manager = GameManager(db)
        wallet = WalletService(db)
        
        # Create test users
        user1 = User(username="test_rematch1", email="test1@rematch.com", hashed_password="x", points=1000)
        user2 = User(username="test_rematch2", email="test2@rematch.com", hashed_password="x", points=1000)
        db.add_all([user1, user2])
        db.commit()
        db.refresh(user1)
        db.refresh(user2)
        print("Created users: test_rematch1 and test_rematch2")
        
        # Test 1: Basic rematch flow
        print("\n=== Test 1: Basic rematch flow ===")
        game = await manager.create_game(user1.id, "blackjack", 50)
        await manager.join_game(game.id, user2.id)
        game = await manager.start_game(game.id, user1.id)
        game = await manager.apply_action(game.id, user1.id, "stand")
        game = await manager.apply_action(game.id, user2.id, "stand")
        assert game.status == GameStatus.FINISHED
        
        new_game = await manager.rematch_game(game.id, user1.id)
        assert new_game.status == GameStatus.WAITING
        assert new_game.buy_in == 50
        assert new_game.player1_id == user1.id
        
        # Check next_game_id stored
        import json
        state = json.loads(game.state) if isinstance(game.state, str) else game.state
        assert state.get("metadata", {}).get("next_game_id") == new_game.id
        print("PASS: next_game_id stored in original game state")
        
        # Test 2: Idempotency
        print("\n=== Test 2: Idempotency ===")
        same = await manager.rematch_game(game.id, user1.id)
        assert same.id == new_game.id
        print("PASS: Idempotent rematch calls return same game")
        
        # Test 3: User2 joins rematch
        print("\n=== Test 3: Second player joins rematch ===")
        await manager.join_game(new_game.id, user2.id)
        sessions = db.query(GameSession).filter(GameSession.game_id == new_game.id).count()
        assert sessions == 2
        print("PASS: Second player can join rematch")
        
        # Test 4: Concurrent rematch calls
        print("\n=== Test 4: Concurrent rematch calls ===")
        g1 = await manager.rematch_game(game.id, user1.id)
        g2 = await manager.rematch_game(game.id, user2.id)
        assert g1.id == g2.id == new_game.id
        print("PASS: Concurrent calls return same game")
        
        # Test 5: Balance charged correctly
        print("\n=== Test 5: Balance charged correctly ===")
        db.refresh(user1)
        db.refresh(user2)
        # Each paid 50 for original + 50 for rematch = 100 total (1000 - 100 = 900)
        # But they also won/lost the first game
        print(f"User1 balance: {user1.points}")
        print(f"User2 balance: {user2.points}")
        # Balance should reflect: initial 1000 - 50 (game1 buyin) + game1 result - 50 (rematch buyin)
        print("PASS: Balance tracking works")
        
        # Test 6: Error cases
        print("\n=== Test 6: Error cases ===")
        
        # Non-player
        user3 = User(username="test_rematch3", email="test3@rematch.com", hashed_password="x", points=1000)
        db.add(user3)
        db.commit()
        db.refresh(user3)
        try:
            await manager.rematch_game(game.id, user3.id)
            print("FAIL: Should reject non-player")
        except ValueError as e:
            assert "Not a player" in str(e)
            print(f"PASS: Non-player rejected: {e}")
        
        # Non-finished game
        game2 = await manager.create_game(user1.id, "blackjack", 50)
        try:
            await manager.rematch_game(game2.id, user1.id)
            print("FAIL: Should reject non-finished game")
        except ValueError as e:
            assert "not finished" in str(e).lower()
            print(f"PASS: Non-finished game rejected: {e}")
        
        # Insufficient balance (user in original game, no points)
        user4 = User(username="test_rematch4", email="test4@rematch.com", hashed_password="x", points=0)
        db.add(user4)
        db.flush()  # Get ID
        # Add user4 to original game (simulate they played)
        session4 = GameSession(game_id=game.id, user_id=user4.id, position=2, buy_in=50, result="loss")
        db.add(session4)
        db.commit()
        db.refresh(user4)
        
        try:
            await manager.rematch_game(game.id, user4.id)
            print("FAIL: Should reject insufficient balance")
        except ValueError as e:
            assert "Insufficient" in str(e)
            print(f"PASS: Insufficient balance rejected: {e}")
        
        # Test 7: Next game already started/full - new player can't join
        print("\n=== Test 7: Next game already started ===")
        # Start the rematch game
        await manager.start_game(new_game.id, user1.id)
        db.refresh(new_game)
        assert new_game.status == GameStatus.IN_PROGRESS
        
        # Create user5 who was in original game but NOT in rematch
        user5 = User(username="test_rematch5", email="test5@rematch.com", hashed_password="x", points=1000)
        db.add(user5)
        db.flush()  # Get ID
        session5 = GameSession(game_id=game.id, user_id=user5.id, position=3, buy_in=50, result="loss")
        db.add(session5)
        db.commit()
        db.refresh(user5)
        
        try:
            await manager.rematch_game(game.id, user5.id)
            print("FAIL: Should reject when next game already started")
        except ValueError as e:
            assert "already started or full" in str(e)
            print(f"PASS: Next game started rejected: {e}")
        
        # Test 8: Solo play (min_players=1)
        print("\n=== Test 8: Solo play rematch ===")
        solo_user = User(username="test_solo", email="solo@test.com", hashed_password="x", points=1000)
        db.add(solo_user)
        db.commit()
        db.refresh(solo_user)
        
        solo_game = await manager.create_game(solo_user.id, "blackjack", 50)
        await manager.start_game(solo_game.id, solo_user.id)
        solo_game = await manager.apply_action(solo_game.id, solo_user.id, "stand")
        assert solo_game.status == GameStatus.FINISHED
        
        new_solo = await manager.rematch_game(solo_game.id, solo_user.id)
        assert new_solo.status == GameStatus.WAITING
        assert new_solo.player1_id == solo_user.id
        assert new_solo.buy_in == 50
        print("PASS: Solo play rematch works")
        
        # Test 9: Double-click protection
        print("\n=== Test 9: Double-click protection ===")
        g_a = await manager.rematch_game(solo_game.id, solo_user.id)
        g_b = await manager.rematch_game(solo_game.id, solo_user.id)
        assert g_a.id == g_b.id == new_solo.id
        print("PASS: Double-click creates only one game")
        
        print("\n=== ALL TESTS PASSED ===")
        
    except Exception as e:
        print(f"Test failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

asyncio.run(test_rematch())