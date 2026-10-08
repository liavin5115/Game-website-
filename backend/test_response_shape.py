"""Test response shape and serializer using existing database"""
import json

# Test serializer output
print("=== Testing Blackjack Serializer ===\n")

# Simulate in_progress blackjack game state
from games.blackjack import BlackjackGame

players = [
    {"id": 1, "username": "player1", "chips": 900},
    {"id": 2, "username": "player2", "chips": 900}
]

game = BlackjackGame(buy_in=100, players=players)
game.start_game()

print("Game state after start_game():")
state_json = game.to_json()
state = json.loads(state_json)

print(f"\n1. Community cards (dealer): {state['community_cards']}")
print(f"   Expected: ['XX', '??'] where XX is visible card, ?? is hole card")

print(f"\n2. Metadata keys: {list(state['metadata'].keys())}")
if 'dealer_cards' in state['metadata']:
    print(f"   ✗ LEAK: dealer_cards in metadata: {state['metadata']['dealer_cards']}")
else:
    print(f"   ✓ No dealer_cards in metadata (hole card hidden)")

print(f"\n3. Player cards visibility:")
for p in state['players']:
    print(f"   Player {p['id']}: {p['cards']} (status: {p['status']})")

print(f"\n4. Player state for player 1:")
p1_state = game.get_state_for_player(1)
print(f"   Cards: {p1_state['players'][0]['cards']}")
print(f"   Other player cards: {p1_state['players'][1]['cards'] if len(p1_state['players']) > 1 else 'N/A'}")

# Test that all player cards are visible in blackjack
if '??' in str(p1_state['players'][1].get('cards', [])):
    print(f"   ✗ Other player cards hidden (wrong for blackjack)")
else:
    print(f"   ✓ Other player cards visible (correct for blackjack)")

print("\n=== Test Complete ===")
