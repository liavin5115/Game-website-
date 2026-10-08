/** Poker table component with player seats and community cards */
import { useEffect, useState } from 'react';
import { gamesApi } from '../../../api/client';
import { useGameStore } from '../../../stores/gameStore';
import { useAuthStore } from '../../../stores/authStore';
import type { Game, GameState, PlayerState, ValidAction } from '../../../types';
import { Card } from './Card';
import { Button } from '../../common/Button';
import { Modal } from '../../common/Modal';

const actionLabels: Record<string, string> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Bet',
  raise: 'Raise',
};

export function PokerTable({ gameId }: { gameId: number }) {
  const { user } = useAuthStore();
  const {
    currentGame,
    gameState,
    myPlayer,
    setCurrentGame,
    setGameState,
    setMyPlayer,
    clearGame,
  } = useGameStore();

  const [validActions, setValidActions] = useState<ValidAction[]>([]);
  const [betAmount, setBetAmount] = useState(0);
  const [showBetModal, setShowBetModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load game on mount
  useEffect(() => {
    const loadGame = async () => {
      try {
        const res = await gamesApi.get(gameId);
        setCurrentGame(res.data);
        setGameState(res.data.state);
        const me = res.data.state.players.find((p) => p.id === user?.id);
        setMyPlayer(me || null);
      } catch (err) {
        console.error('Failed to load game:', err);
      }
    };
    loadGame();
    return () => clearGame();
  }, [gameId, setCurrentGame, setGameState, setMyPlayer, clearGame, user?.id]);

  // Determine valid actions for current player
  useEffect(() => {
    if (!myPlayer || !gameState) return;

    const isMyTurn = gameState.current_player < gameState.players.length &&
      gameState.players[gameState.current_player].id === myPlayer.id &&
      myPlayer.status === 'active';

    if (!isMyTurn) {
      setValidActions([]);
      return;
    }

    const currentBet = gameState.current_bet;
    const myBet = myPlayer.bet;
    const callAmount = currentBet - myBet;
    const canBet = myPlayer.chips > 0;

    const actions: ValidAction[] = [{ type: 'fold' }];

    if (callAmount > 0) {
      actions.push({ type: 'call', min_amount: callAmount, max_amount: callAmount });
    } else {
      actions.push({ type: 'check' });
    }

    if (canBet) {
      actions.push({ type: 'bet', min_amount: gameState.min_raise, max_amount: myPlayer.chips });
      if (currentBet > 0) {
        actions.push({ type: 'raise', min_amount: currentBet + gameState.min_raise, max_amount: myPlayer.chips + myBet });
      }
    }

    setValidActions(actions);
  }, [gameState, myPlayer]);

  const handleAction = async (actionType: string, amount?: number) => {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      await gamesApi.action({
        game_id: gameId,
        action: actionType,
        amount: amount || 0,
      });
      // State will update via WebSocket or next poll
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Action failed');
    } finally {
      setLoading(false);
      setShowBetModal(false);
      setPendingAction(null);
    }
  };

  const handleBetAction = (actionType: string) => {
    setPendingAction(actionType);
    const action = validActions.find((a) => a.type === actionType);
    setBetAmount(action?.min_amount || gameState?.min_raise || 10);
    setShowBetModal(true);
  };

  const confirmBet = () => {
    if (pendingAction) {
      handleAction(pendingAction, betAmount);
    }
  };

  const getPhaseLabel = (phase: string) => {
    const labels: Record<string, string> = {
      waiting: 'Waiting',
      betting: 'Pre-flop',
      playing: 'Post-flop',
      showdown: 'Showdown',
      finished: 'Finished',
    };
    return labels[phase] || phase;
  };

  if (!currentGame || !gameState) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading game...</div>;
  }

  const isMyTurn = gameState.current_player < gameState.players.length &&
    gameState.players[gameState.current_player].id === user?.id;

  return (
    <div className="space-y-6">
      {/* Game Info Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Poker Table</h2>
          <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
            {getPhaseLabel(gameState.phase)}
          </span>
          <span className="text-gray-500 dark:text-gray-400">Pot: </span>
          <span className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{gameState.pot} pts</span>
        </div>

        {isMyTurn && myPlayer?.status === 'active' && (
          <div className="flex gap-2">
            {validActions.map((action) => (
              <Button
                key={action.type}
                variant={action.type === 'fold' ? 'danger' : 'primary'}
                size="sm"
                onClick={() => action.type === 'bet' || action.type === 'raise'
                  ? handleBetAction(action.type)
                  : handleAction(action.type)}
                disabled={loading}
              >
                {actionLabels[action.type] || action.type}
                {action.type === 'call' && ` ${action.min_amount}`}
              </Button>
            ))}
          </div>
        )}

        {!isMyTurn && myPlayer?.status === 'active' && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Waiting for {gameState.players[gameState.current_player]?.username || 'opponent'}...
          </div>
        )}

        {myPlayer?.status === 'folded' && (
          <div className="text-sm text-gray-500 dark:text-gray-400">You folded</div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Community Cards */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">Community Cards</h3>
        <div className="flex justify-center gap-3 flex-wrap">
          {gameState.community_cards.length === 0 ? (
            <div className="text-gray-500 dark:text-gray-400 text-center w-full">No community cards yet</div>
          ) : (
            gameState.community_cards.map((card, i) => (
              <Card key={i} card={card} size="md" />
            ))
          )}
        </div>
      </div>

      {/* Player Seats - arranged around table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border dark:border-gray-700 relative">
        {/* Top player (opponent) */}
        {gameState.players[1] && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 transform">
            <PlayerSeat player={gameState.players[1]} isCurrent={gameState.current_player === 1} isMe={false} />
          </div>
        )}

        {/* Bottom player (me) */}
        {myPlayer && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 transform">
            <PlayerSeat player={myPlayer} isCurrent={gameState.current_player === 0} isMe={true} />
          </div>
        )}

        {/* Additional players for 3+ player games */}
        {gameState.players.slice(2).map((player, i) => (
          <div key={player.id} className="absolute">
            <PlayerSeat player={player} isCurrent={gameState.current_player === i + 2} isMe={false} />
          </div>
        ))}

        {/* Dealer button indicator */}
        {gameState.players.length > 0 && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="w-8 h-8 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm shadow">
              D
            </div>
          </div>
        )}
      </div>

      {/* Bet Modal */}
      <Modal
        isOpen={showBetModal}
        onClose={() => { setShowBetModal(false); setPendingAction(null); }}
        title={`${actionLabels[pendingAction || '']} Amount`}
        size="sm"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount</label>
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(parseInt(e.target.value) || 0)}
              min={validActions.find(a => a.type === pendingAction)?.min_amount || 0}
              max={validActions.find(a => a.type === pendingAction)?.max_amount || myPlayer?.chips || 0}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Min: {validActions.find(a => a.type === pendingAction)?.min_amount || 0} •
              Max: {validActions.find(a => a.type === pendingAction)?.max_amount || myPlayer?.chips || 0}
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setShowBetModal(false); setPendingAction(null); }} className="flex-1">
              Cancel
            </Button>
            <Button onClick={confirmBet} loading={loading} className="flex-1">
              Confirm
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

interface PlayerSeatProps {
  player: PlayerState;
  isCurrent: boolean;
  isMe: boolean;
}

function PlayerSeat({ player, isCurrent, isMe }: PlayerSeatProps) {
  const statusColors: Record<string, string> = {
    active: 'text-green-600 dark:text-green-400',
    folded: 'text-gray-500 dark:text-gray-400',
    bust: 'text-red-600 dark:text-red-400',
    winner: 'text-yellow-600 dark:text-yellow-400',
  };

  return (
    <div className={`flex flex-col items-center gap-2 ${isCurrent ? 'ring-2 ring-blue-500 rounded-lg p-2' : ''}`}>
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-medium">
          {player.username[0].toUpperCase()}
        </div>
        <span className="font-medium text-gray-900 dark:text-white">{player.username}</span>
        {isMe && <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded">You</span>}
      </div>

      <div className="flex gap-1">
        {player.cards.map((card, i) => (
          <Card key={i} card={card} size="sm" faceDown={!isMe && player.status !== 'folded'} />
        ))}
      </div>

      <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <span>Chips: </span>
        <span className="font-mono font-semibold text-gray-900 dark:text-white">{player.chips}</span>
        {player.bet > 0 && (
          <>
            <span className="text-yellow-600">Bet:</span>
            <span className="font-mono font-semibold text-yellow-600">{player.bet}</span>
          </>
        )}
      </div>

      <div className={`text-xs font-medium ${statusColors[player.status] || 'text-gray-500'}`}>
        {player.status === 'active' ? (isCurrent ? 'Your turn' : 'Active') : player.status}
      </div>
    </div>
  );
}