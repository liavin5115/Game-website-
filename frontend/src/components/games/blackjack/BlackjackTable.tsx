/** Blackjack table component */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gamesApi, authApi } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { useGameSocket } from '../../../hooks/useGameSocket';
import { Card } from '../poker/Card';
import { Button } from '../../common/Button';


const actionLabels: Record<string, string> = {
  hit: 'Hit',
  stand: 'Stand',
  double: 'Double Down',
};

export function BlackjackTable({ gameId }: { gameId: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, updatePoints } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rematchLoading, setRematchLoading] = useState(false);
  const [clockOffset, setClockOffset] = useState(0); // server_time - Date.now()
  const [turnSeq, setTurnSeq] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const countdownIntervalRef = useRef<number>();
  const refetchTimeoutRef = useRef<number>();

  useGameSocket(gameId);

  const { data: game, isLoading } = useQuery({
    queryKey: ['game', gameId],
    queryFn: async () => {
      const res = await gamesApi.get(gameId);
      return res.data;
    },
    refetchInterval: false,
  });

  const { isConnected, showReconnectBanner } = useGameSocket(gameId);

  // Update clockOffset and turnSeq from server response
  useEffect(() => {
    if (game?.server_time) {
      const serverTime = new Date(game.server_time).getTime();
      setClockOffset(serverTime - Date.now());
    }
    if (game?.turn_seq !== undefined) {
      setTurnSeq(game.turn_seq);
    }
  }, [game?.server_time, game?.turn_seq]);

  // Countdown timer - runs for all players to see the current player's timer
  useEffect(() => {
    const turnDeadline = game?.turn_deadline;
    const isInProgress = game?.status === 'in_progress';
    const myTurn = game?.current_turn_user_id === user?.id;

    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = undefined;
    }
    if (refetchTimeoutRef.current) {
      clearTimeout(refetchTimeoutRef.current);
      refetchTimeoutRef.current = undefined;
    }

    if (!isInProgress || !turnDeadline) {
      setRemaining(0);
      return;
    }

    const deadlineMs = new Date(turnDeadline).getTime();

    const tick = () => {
      const now = Date.now() + clockOffset;
      const remainingSec = Math.max(0, Math.ceil((deadlineMs - now) / 1000));
      setRemaining(remainingSec);

      // Only the active player needs the 2s fallback refetch
      if (remainingSec <= 0 && myTurn) {
        if (!refetchTimeoutRef.current) {
          refetchTimeoutRef.current = window.setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['game', gameId] });
          }, 2000);
        }
      }
    };

    tick();
    countdownIntervalRef.current = window.setInterval(tick, 250);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      if (refetchTimeoutRef.current) {
        clearTimeout(refetchTimeoutRef.current);
      }
    };
  }, [game?.status, game?.turn_deadline, game?.current_turn_user_id, clockOffset, gameId, queryClient, user?.id]);

  useEffect(() => {
    if (game?.status === 'waiting') {
      navigate(`/game/${gameId}/waiting`);
    }
  }, [game?.status, gameId, navigate]);

  useEffect(() => {
    if (game?.status === 'finished') {
      authApi.me().then(res => {
        useAuthStore.getState().setAuth(res.data, localStorage.getItem('access_token') || '');
      });
      window.dispatchEvent(new CustomEvent('wallet:refetch'));
    }
  }, [game?.status]);

  const handleRematch = async () => {
    if (rematchLoading || !game) return;
    setRematchLoading(true);
    setError('');

    try {
      const res = await gamesApi.rematch({ game_id: gameId });
      const newGame = res.data;

      const meRes = await authApi.me();
      updatePoints(meRes.data.points);

      navigate(`/game/${newGame.id}/waiting`);
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Rematch failed';
      if (err.response?.status === 409) {
        setError(detail);
      } else {
        setError(detail);
      }
    } finally {
      setRematchLoading(false);
    }
  };

  const handleAction = useCallback(async (actionType: string) => {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      await gamesApi.action({ game_id: gameId, action: actionType, turn_seq: turnSeq });
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    } catch (err: any) {
      if (err.response?.status === 409) {
        // Turn expired or not your turn - silent refetch + small toast
        queryClient.invalidateQueries({ queryKey: ['game', gameId] });
        setError('Turn expired');
        setTimeout(() => setError(''), 2000);
      } else {
        setError(err.response?.data?.detail || 'Action failed');
      }
    } finally {
      setLoading(false);
    }
  }, [gameId, turnSeq, loading, queryClient]);

  const getHandValue = (cards: string[]) => {
    let total = 0;
    let aces = 0;
    for (const card of cards) {
      const rank = card[0];
      if (rank === 'A') { total += 11; aces++; }
      else if (['K', 'Q', 'J', 'T'].includes(rank)) total += 10;
      else total += parseInt(rank);
    }
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
  };

  const turnSeconds = game?.turn_seconds ?? 30;
  const progress = turnSeconds > 0 ? Math.max(0, Math.min(100, (remaining / turnSeconds) * 100)) : 0;
  const isLowTime = remaining <= 5 && remaining > 0;

  if (isLoading || !game) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading game...</div>;
  }

  const gameState = game.state;
  const myId = user?.id;
  const isMyTurn = game.current_turn_user_id === myId;
  const currentTurnPlayer = gameState.players[gameState.current_player];

  const dealerCards = gameState.metadata?.dealer_hidden
    ? gameState.community_cards
    : (gameState.metadata?.dealer_cards || gameState.community_cards);

  const dealerValue = gameState.metadata?.dealer_hidden
    ? dealerCards[0] ? `${getHandValue([dealerCards[0]])} + ?` : '?'
    : getHandValue(dealerCards);

  const hasManyCards = (cards: string[]) => cards.length > 3;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">♣ Blackjack</h2>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              Dealer hits soft 17 • Blackjack pays 3:2
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-medium">
              Pot: {gameState.pot} pts
            </span>
          </div>
        </div>
        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Reconnection Banner */}
      {showReconnectBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-orange-600 text-white rounded-lg shadow-lg text-sm font-medium animate-pulse">
          Reconnecting...
        </div>
      )}
      {!showReconnectBanner && !isConnected && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg text-sm font-medium">
          Back online
        </div>
      )}

      {/* Dealer Area */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 text-center">Dealer</h3>
        <div className="flex justify-center gap-2 min-h-[88px]">
          {dealerCards.map((card: string, i: number) => (
            <div key={i} className={hasManyCards(dealerCards) ? '-mx-2' : ''}>
              <Card
                card={gameState.metadata?.dealer_hidden && i === 1 ? '??' : card}
                size="md"
              />
            </div>
          ))}
        </div>
        <div className="mt-4 text-center">
          <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm font-medium text-gray-900 dark:text-white">
            {dealerValue}
          </span>
        </div>
      </div>

      {/* Players Grid */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
        {gameState.players.map((player: any) => {
          const isCurrentPlayer = player.id === myId;
          const isCurrentTurn = gameState.players[gameState.current_player]?.id === player.id;
          const playerValue = getHandValue(player.cards);
          const isAutoStood = player.auto_stood === true;
          const isAway = player.away === true;
          const isPlayerConnected = player.connected !== false;

          return (
            <div
              key={player.id}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border dark:border-gray-700 ${
                isCurrentTurn ? 'ring-2 ring-yellow-500' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-900 dark:text-white">{player.username}</span>
                  {isCurrentPlayer && <span className="text-xs text-yellow-600 font-medium">(You)</span>}
                  {isAutoStood && (
                    <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded font-medium">Auto-stand (timed out)</span>
                  )}
                  {isAway && (
                    <span className="text-xs bg-gray-500 text-white px-2 py-0.5 rounded font-medium">Away</span>
                  )}
                  {!isPlayerConnected && !isCurrentPlayer && (
                    <span className="text-xs bg-red-500 text-white px-2 py-0.5 rounded font-medium">Disconnected</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {isCurrentTurn && (
                    <span className="text-xs bg-yellow-500 text-white px-2 py-0.5 rounded font-medium">Turn</span>
                  )}
                </div>
              </div>

              <div className="mb-4">
                <span className="text-sm text-gray-500 dark:text-gray-400">Bet: {player.bet} pts</span>
              </div>

              <div className="flex justify-center min-h-[88px] mb-4">
                <div className={`flex ${hasManyCards(player.cards) ? '-mx-2' : 'gap-2'}`}>
                  {player.cards.map((card: string, i: number) => (
                    <Card key={i} card={card} size="md" />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-center gap-2 flex-wrap">
                <span className="inline-block px-3 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-sm font-medium text-gray-900 dark:text-white">
                  {playerValue}
                </span>
                {player.status !== 'playing' && player.status !== 'waiting' && (
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                    player.status === 'blackjack' ? 'bg-yellow-500 text-white' :
                    player.status === 'bust' ? 'bg-red-500 text-white' :
                    player.status === 'win' ? 'bg-green-500 text-white' :
                    player.status === 'loss' ? 'bg-red-600 text-white' :
                    'bg-yellow-600 text-white'
                  }`}>
                    {player.status.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Countdown Timer for Current Player's Turn (visible to all) */}
      {game.status === 'in_progress' && game.current_turn_user_id && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700" role="timer" aria-live="polite">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Time to act: <span className="font-bold text-yellow-600">{currentTurnPlayer?.username}</span>
            </span>
            <span className={`text-sm font-mono font-bold ${isLowTime ? 'text-red-600' : 'text-gray-700 dark:text-gray-300'}`}>
              {remaining}s
            </span>
          </div>
          <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-250 ease-linear ${isLowTime ? 'bg-red-500' : 'bg-yellow-500'}`}
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={remaining}
              aria-valuemin={0}
              aria-valuemax={turnSeconds}
            />
          </div>
          {isMyTurn && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
              Your turn - choose an action below
            </p>
          )}
        </div>
      )}

      {/* Action Bar */}
      {game.status === 'in_progress' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border dark:border-gray-700">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {isMyTurn ? (
              <>
                {game.my_valid_actions.map((action: string) => (
                  <Button
                    key={action}
                    variant={action === 'stand' ? 'secondary' : 'primary'}
                    onClick={() => handleAction(action)}
                    disabled={loading || remaining <= 0 || !isConnected}
                    className="min-w-[120px]"
                  >
                    {actionLabels[action] || action}
                  </Button>
                ))}
              </>
            ) : (
              <div className="text-center text-gray-500 dark:text-gray-400">
                Waiting for <span className="font-medium">{currentTurnPlayer?.username}</span>...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Result */}
      {game.status === 'finished' && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border dark:border-gray-700">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 text-center">Game Over</h3>

          <div className="grid gap-3 mb-6">
            {gameState.players.map((player: any) => {
              const payout = player.payout !== undefined ? player.payout : 0;
              const profit = payout - player.bet;
              const resultStatus = player.result || player.status;

              return (
                <div key={player.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="font-medium text-gray-900 dark:text-white">{player.username}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${
                      resultStatus === 'win' || resultStatus === 'blackjack' ? 'text-green-600' :
                      resultStatus === 'loss' || resultStatus === 'bust' ? 'text-red-600' :
                      'text-yellow-600'
                    }`}>
                      {resultStatus.toUpperCase()}
                    </span>
                    <span className={`font-mono font-bold ${
                      profit > 0 ? 'text-green-600' : profit < 0 ? 'text-red-600' : 'text-yellow-600'
                    }`}>
                      {profit > 0 ? '+' : ''}{profit} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={handleRematch}
              loading={rematchLoading}
              disabled={rematchLoading || (user?.points ?? 0) < game.buy_in}
              className="min-w-[180px]"
            >
              {game.next_game_id ? 'Join Rematch' : `Play Again (${game.buy_in} pts)`}
            </Button>
            {(user?.points ?? 0) < game.buy_in && !rematchLoading && (
              <span className="text-sm text-red-600 dark:text-red-400 text-center sm:text-left">
                Insufficient balance ({user?.points ?? 0} pts, need {game.buy_in} pts)
              </span>
            )}
            {error && (
              <div className="w-full text-center text-red-600 dark:text-red-400 text-sm mt-2">
                {error}
              </div>
            )}
            <Button onClick={() => navigate('/lobby')} size="lg" variant="secondary">
              Back to Lobby
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}