"""Repro script for poker two-player turn bug."""
import requests, time, json

BASE = "http://127.0.0.1:8000"
def login(username, password="password"):
    r = requests.post(f"{BASE}/api/auth/login", json={"username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]

def api(token, method, path, **kw):
    h = {"Authorization": f"Bearer {token}"}
    return requests.request(method, f"{BASE}{path}", headers=h, **kw)

def dump(token, game_id):
    r = api(token, "GET", f"/api/games/{game_id}")
    d = r.json()
    state = d.get("state", {})
    players = state.get("players", [])
    print(f"  GET as token... status={d['status']} street={state.get('metadata',{}).get('street')} current_turn={d.get('current_turn_user_id')} turn_seq={d.get('turn_seq')} deadline={d.get('turn_deadline')}")
    print(f"    my_valid_actions={d.get('my_valid_actions')}")
    for p in players:
        print(f"    player id={p['id']} username={p.get('username')} status={p['status']} chips={p.get('chips')} bet={p.get('bet')} total_bet={p.get('total_bet')}")

# Create two users
for u in ["repro_p1", "repro_p2"]:
    try:
        api(None, "POST", "/api/auth/register", json={"username": u, "email": f"{u}@test.com", "password": "password"})
    except:
        pass

t1 = login("repro_p1")
t2 = login("repro_p2")

# Create game
r = api(t1, "POST", "/api/games/create", json={"game_type": "poker", "buy_in": 100})
game_id = r.json()["id"]
print(f"Game {game_id} created")

# Join
api(t2, "POST", "/api/games/join", json={"game_id": game_id})
print("Player 2 joined")

# Start
api(t1, "POST", "/api/games/start", json={"game_id": game_id})
print("Game started")

# Get initial state
print("\n=== Initial state ===")
dump(t1, game_id)
dump(t2, game_id)

# Loop 6 actions
for i in range(6):
    print(f"\n=== Action {i+1} ===")
    # Get current state as player 1
    r = api(t1, "GET", f"/api/games/{game_id}")
    d = r.json()
    current_turn = d.get("current_turn_user_id")
    turn_seq = d.get("turn_seq", 0)
    valid = d.get("my_valid_actions", [])
    print(f"  Current turn: {current_turn}, turn_seq: {turn_seq}, valid: {valid}")

    # Determine who acts
    if current_turn == d.get("players", [{}])[0].get("id") if d.get("players") else None:
        actor_token = t1
        actor_name = "P1"
    else:
        actor_token = t2
        actor_name = "P2"

    # Actually, check which user is on turn
    # Get player 1's user id
    r_me = api(t1, "GET", "/api/auth/me")
    p1_id = r_me.json()["id"]
    r_me2 = api(t2, "GET", "/api/auth/me")
    p2_id = r_me2.json()["id"]

    if current_turn == p1_id:
        actor_token, actor_name = t1, "P1"
    else:
        actor_token, actor_name = t2, "P2"

    print(f"  {actor_name} acting...")

    # Pick an action
    if "check" in valid and actor_token == t1:
        action = "check"
    elif "call" in valid:
        action = "call"
        amount = 0
    elif "check" in valid:
        action = "check"
    elif "fold" in valid:
        action = "fold"
    else:
        action = "check"

    # Get amount for call
    amount = 0
    if action == "call":
        state = d.get("state", {})
        current_bet = state.get("current_bet", 0)
        my_player = next((p for p in state.get("players", []) if p["id"] == (p1_id if actor_token == t1 else p2_id)), None)
        if my_player:
            amount = current_bet - my_player.get("bet", 0)

    print(f"  Action: {action} amount={amount} turn_seq={turn_seq}")

    r = api(actor_token, "POST", "/api/games/action", json={
        "game_id": game_id, "action": action, "amount": amount, "turn_seq": turn_seq
    })
    print(f"  Action response: {r.status_code} {r.text[:200]}")

    # Dump state for both users
    print("\n  After action:")
    dump(t1, game_id)
    dump(t2, game_id)

    time.sleep(0.5)

print("\n=== Done ===")