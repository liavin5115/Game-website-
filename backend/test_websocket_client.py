"""WebSocket test client for broadcast verification"""
import asyncio
import json
import websockets

async def test_broadcast():
    """Connect to game WebSocket and wait for broadcasts"""
    # Replace with actual token from your auth system
    token = "YOUR_TOKEN_HERE"
    game_id = 1

    uri = f"ws://localhost:8000/ws/game/{game_id}?token={token}"

    print(f"Connecting to {uri}")

    try:
        async with websockets.connect(uri) as websocket:
            print("✓ Connected to WebSocket")

            # Wait for initial state
            msg = await asyncio.wait_for(websocket.recv(), timeout=5)
            data = json.loads(msg)
            print(f"✓ Received initial message: {data.get('type')}")

            print("\nNow trigger a join action with curl in another terminal:")
            print(f"curl -X POST http://localhost:8000/api/games/join -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' -d '{{\"game_id\": {game_id}}}'")

            print("\nWaiting for broadcast...")
            msg = await asyncio.wait_for(websocket.recv(), timeout=10)
            data = json.loads(msg)
            print(f"✓ Received broadcast: {json.dumps(data, indent=2)}")

            if data.get("type") == "state_changed":
                print("\n✓✓✓ BROADCAST TEST PASSED ✓✓✓")
            else:
                print(f"\n✗ Expected 'state_changed', got {data.get('type')}")

    except asyncio.TimeoutError:
        print("✗ Timeout waiting for message")
    except Exception as e:
        print(f"✗ Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_broadcast())
