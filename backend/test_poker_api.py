"""API-level poker tests: 3 users, real HTTP endpoints, no internal shortcuts.

Run from backend/:
    venv\\Scripts\\python.exe -m pytest test_poker_api.py -q
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from database import SessionLocal
from main import app
from models import Game, GameSession, GameStatus, Transaction
from games.base import GamePhase
from games.poker import PokerGame

PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def _register(client: TestClient, prefix: str) -> dict:
    name = f"{prefix}_{uuid.uuid4().hex[:10]}"
    r = client.post(
        "/api/auth/register",
        json={"username": name, "email": f"{name}@example.com", "password": PASSWORD},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    return {"id": data["user"]["id"], "name": name, "token": data["access_token"]}


def _h(user: dict) -> dict:
    return {"Authorization": f"Bearer {user['token']}"}


def _users(client: TestClient, n: int = 3) -> list[dict]:
    return [_register(client, f"api{i}") for i in range(n)]


def _new_game(client: TestClient, users: list[dict], n: int = 3) -> int:
    r = client.post(
        "/api/games/create",
        headers=_h(users[0]),
        json={"game_type": "poker", "buy_in": 100},
    )
    assert r.status_code == 200, r.text
    gid = r.json()["id"]
    for u in users[1:n]:
        r = client.post("/api/games/join", headers=_h(u), json={"game_id": gid})
        assert r.status_code == 200, r.text
    r = client.post("/api/games/start", headers=_h(users[0]), json={"game_id": gid})
    assert r.status_code == 200, r.text
    return gid


def _get(client: TestClient, user: dict, gid: int) -> dict:
    r = client.get(f"/api/games/{gid}", headers=_h(user))
    assert r.status_code == 200, r.text
    return r.json()


def _actor(client: TestClient, users: list[dict], gid: int):
    """Return (acting_user, game_snapshot) using the latest GET, or (None, game)."""
    last = None
    for u in users:
        g = _get(client, u, gid)
        last = g
        if g["status"] == "finished":
            return None, g
        if g.get("current_turn_user_id") == u["id"]:
            return u, g
    return None, last


def _act(client: TestClient, user: dict, gid: int, action: str, amount: int = 0, seq=None):
    if seq is None:
        g = _get(client, user, gid)
        seq = g["turn_seq"]
    return client.post(
        "/api/games/action",
        headers=_h(user),
        json={"game_id": gid, "action": action, "amount": amount, "turn_seq": seq},
    )


def test_datetimes_have_explicit_utc_zone(client):
    users = _users(client)
    gid = _new_game(client, users)
    g = _get(client, users[0], gid)

    for field in ("created_at", "started_at", "turn_deadline", "server_time"):
        value = g[field]
        assert value is not None, field
        assert value.endswith("Z"), f"{field} lacks UTC zone: {value!r}"


def test_actions_in_order_with_bb_option(client):
    users = _users(client)
    gid = _new_game(client, users)

    u0, g = _actor(client, users, gid)
    assert u0["id"] == users[0]["id"]
    assert g["turn_seq"] == 1

    r = _act(client, u0, gid, "call")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["current_turn_user_id"] == users[1]["id"]
    assert body["turn_seq"] == 2

    u1, g = _actor(client, users, gid)
    assert u1["id"] == users[1]["id"]
    r = _act(client, u1, gid, "call")
    assert r.status_code == 200, r.text
    assert r.json()["current_turn_user_id"] == users[2]["id"]

    # Big-blind option: BB may check or raise.
    u2, g = _actor(client, users, gid)
    assert u2["id"] == users[2]["id"]
    assert "check" in g["my_valid_actions"]
    r = _act(client, u2, gid, "check")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["state"]["metadata"]["street"] == 1
    assert body["current_turn_user_id"] == users[1]["id"]


def test_wrong_user_gets_409(client):
    users = _users(client)
    gid = _new_game(client, users)
    u0, _ = _actor(client, users, gid)
    assert _act(client, u0, gid, "call").status_code == 200

    u1, g = _actor(client, users, gid)
    wrong = users[0]
    assert wrong["id"] != u1["id"]
    r = _act(client, wrong, gid, "check", seq=g["turn_seq"])
    assert r.status_code == 409, r.text
    assert "Not your turn" in r.json()["detail"]


def test_stale_turn_seq_gets_409(client):
    users = _users(client)
    gid = _new_game(client, users)
    u0, _ = _actor(client, users, gid)
    assert _act(client, u0, gid, "call").status_code == 200

    u1, g = _actor(client, users, gid)
    current = g["turn_seq"]
    assert current >= 2

    r = _act(client, u1, gid, "check", seq=current - 1)
    assert r.status_code == 409, r.text
    assert "Turn expired" in r.json()["detail"]

    # 0 used to be treated as "not provided" and slipped past the guard.
    r = _act(client, u1, gid, "check", seq=0)
    assert r.status_code == 409, r.text
    assert "Turn expired" in r.json()["detail"]


def test_action_after_deadline_gets_409(client):
    users = _users(client)
    gid = _new_game(client, users)
    u0, g = _actor(client, users, gid)
    assert u0["id"] == users[0]["id"]
    seq = g["turn_seq"]

    # Force the deadline into the past; the manager applies the timeout lazily.
    db = SessionLocal()
    try:
        game = db.query(Game).filter(Game.id == gid).first()
        assert game is not None
        game.turn_deadline = datetime.utcnow() - timedelta(seconds=2)
        db.commit()
    finally:
        db.close()

    r = _act(client, u0, gid, "raise", amount=100, seq=seq)
    assert r.status_code == 409, r.text
    assert "Turn expired" in r.json()["detail"]

    g_after = _get(client, users[0], gid)
    assert g_after["turn_deadline"] is None or g_after["turn_seq"] != seq


@pytest.mark.parametrize("size", ["min", "mid", "max", "allin"])
def test_raises_min_mid_max_allin_succeed(client, size):
    users = _users(client)
    gid = _new_game(client, users)
    u, g = _actor(client, users, gid)
    limits = g["my_action_limits"]
    assert limits is not None

    lo, hi = limits["min_raise_to"], limits["max_bet_to"]
    amount = {
        "min": lo,
        "mid": (lo + hi) // 2,
        "max": hi,
        "allin": hi,
    }[size]

    r = _act(client, u, gid, "raise", amount=amount)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["state"]["current_bet"] == amount
    assert body["turn_seq"] == g["turn_seq"] + 1


def test_raise_below_min_gets_400(client):
    users = _users(client)
    gid = _new_game(client, users)
    u, g = _actor(client, users, gid)
    below = g["my_action_limits"]["min_raise_to"] - 1
    assert below > 0

    r = _act(client, u, gid, "raise", amount=below)
    assert r.status_code == 400, r.text
    assert "minimum" in r.json()["detail"].lower()


def test_full_hand_to_showdown(client):
    users = _users(client)
    gid = _new_game(client, users)

    for _ in range(200):
        u, g = _actor(client, users, gid)
        if u is None:
            break
        valid = g.get("my_valid_actions") or []
        if "check" in valid:
            action = "check"
        elif "call" in valid:
            action = "call"
        else:
            action = "fold"
        r = _act(client, u, gid, action)
        assert r.status_code == 200, f"{action} failed: {r.text}"

    final = _get(client, users[0], gid)
    assert final["status"] == "finished"
    assert final["winner_id"] is not None
    assert len(final["state"]["community_cards"]) == 5
    assert final["state"]["phase"] in ("showdown", "finished")


def _me(client: TestClient, user: dict) -> dict:
    r = client.get("/api/auth/me", headers=_h(user))
    assert r.status_code == 200, r.text
    return r.json()


def _assert_conservation(results: list[dict], buy_in: int) -> None:
    assert sum(r["net"] for r in results) == 0
    assert sum(r["payout"] for r in results) == buy_in * len(results)
    for r in results:
        assert r["net"] == r["payout"] - buy_in
        assert isinstance(r["contribution"], int)
        assert 0 <= r["contribution"] <= buy_in


def _assert_wallet_matches(
    client: TestClient,
    users: list[dict],
    gid: int,
    results: list[dict],
    buy_in: int,
    starting: dict[int, int],
):
    by_id = {r["id"]: r for r in results}
    for user in users:
        assert _me(client, user)["points"] == starting[user["id"]] - buy_in + by_id[user["id"]]["payout"]

    db = SessionLocal()
    try:
        rows = db.query(Transaction).filter(Transaction.reference_id == gid).all()
        by_user: dict[int, int] = {}
        for tx in rows:
            if tx.user_id in by_id and tx.amount > 0:
                by_user[tx.user_id] = by_user.get(tx.user_id, 0) + tx.amount
        for user in users:
            expected = by_id[user["id"]]["payout"]
            if expected > 0:
                assert by_user.get(user["id"], 0) == expected
    finally:
        db.close()


def test_showdown_results_match_wallet_and_conserve(client):
    users = _users(client)
    starting = {u["id"]: _me(client, u)["points"] for u in users}
    gid = _new_game(client, users)

    for _ in range(200):
        u, g = _actor(client, users, gid)
        if u is None:
            break
        valid = g.get("my_valid_actions") or []
        action = "check" if "check" in valid else "call"
        assert _act(client, u, gid, action).status_code == 200

    g = _get(client, users[0], gid)
    assert g["status"] == "finished"
    assert g["showdown"] is True
    assert g["pot_total"] == 15
    assert len(g["results"]) == 3
    assert g["winners"]
    assert set(g["winners"]) == {
        r["id"] for r in g["results"] if r["result"] in ("won", "split")
    }

    _assert_conservation(g["results"], 100)
    _assert_wallet_matches(client, users, gid, g["results"], 100, starting)

    for r in g["results"]:
        assert r["result"] in ("won", "lost", "split", "folded")
        assert r["hand_name"], r
        assert len(r["revealed_cards"]) == 2
        assert len(r["hand_cards"]) == 5
    # Getting the same hand as another player must not leak anything different.
    assert _get(client, users[1], gid)["results"] == g["results"]


def test_preflop_fold_is_uncontested_and_net_is_blind(client):
    users = _users(client, 2)
    starting = {u["id"]: _me(client, u)["points"] for u in users}
    gid = _new_game(client, users, n=2)

    actor, before = _actor(client, users, gid)
    assert actor is not None
    assert "fold" in before["my_valid_actions"]
    sb_amount = before["state"]["metadata"]["sb_amount"]
    bb_amount = before["state"]["metadata"]["bb_amount"]

    r = _act(client, actor, gid, "fold")
    assert r.status_code == 200, r.text

    g = _get(client, users[1], gid)
    assert g["status"] == "finished"
    assert g["showdown"] is False
    assert g["pot_total"] == sb_amount + bb_amount
    results = {r["id"]: r for r in g["results"]}
    folder = results[actor["id"]]
    winner = next(r for r in g["results"] if r["id"] != actor["id"])

    assert folder["result"] == "folded"
    assert folder["net"] == -sb_amount
    assert folder["payout"] == 100 - sb_amount
    assert folder["contribution"] == sb_amount
    assert folder["revealed_cards"] == []
    assert folder["hand_name"] is None

    assert winner["result"] == "won"
    assert winner["net"] == sb_amount
    assert winner["payout"] == 100 + sb_amount
    assert winner["revealed_cards"] == []
    assert winner["hand_name"] is None

    _assert_conservation(g["results"], 100)
    _assert_wallet_matches(client, users, gid, g["results"], 100, starting)


def test_odd_chip_split_conserves_and_first_winner_gets_odd_chip():
    players = [
        {"id": 1, "username": "one", "chips": 100},
        {"id": 2, "username": "two", "chips": 100},
        {"id": 3, "username": "three", "chips": 100},
    ]
    game = PokerGame(100, players)
    game.state.phase = GamePhase.FINISHED
    game.state.community_cards = ["2c", "3d", "4h", "5s", "9c"]
    game.state.pot = 201
    game.state.players = [
        # Both active players play the same A-K-high board hand.
        {"id": 1, "username": "one", "chips": 0, "cards": ["Ah", "Kd"],
         "bet": 0, "total_bet": 100, "status": "active"},
        {"id": 2, "username": "two", "chips": 0, "cards": ["As", "Kh"],
         "bet": 0, "total_bet": 100, "status": "active"},
        {"id": 3, "username": "three", "chips": 99, "cards": ["7c", "8c"],
         "bet": 0, "total_bet": 1, "status": "folded"},
    ]
    game.street = 0

    winners = game.get_winners()
    assert winners == [1, 2]
    payouts = game.get_payouts()
    assert payouts == {1: 101, 2: 100, 3: 99}
    assert sum(payouts.values()) == 300
    assert sum(payouts[p["id"]] - 100 for p in game.state.players) == 0
    assert all(payouts[p["id"]] >= 0 for p in game.state.players)
