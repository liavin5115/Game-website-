/** Blackjack table component */
import { useEffect, useState } from 'react';
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
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useGameSocket(gameId);

  const { data: game, isLoading } = useQuery({
    queryKey: ['game', gameId],
    queryFn: async () => {
      const res = await gamesApi.get(gameId);
      return res.data;
    },
  });

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
    }
  }, [game?.status]);

  const handleAction = async (actionType: string) => {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      await gamesApi.action({ game_id: gameId, action: actionType });
      queryClient.invalidateQueries({ queryKey: ['game', gameId] });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

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

  if (isLoading || !game) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading game...</div>;
  }

  const gameState = game.state;
  const myId = user?.id;
  const isMyTurn = game.current_turn_user_id === myId;
  const myPlayer = gameState.players.find((p: any) => p.id === myId);
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

          return (
            <div
              key={player.id}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 border dark:border-gray-700 ${
                isCurrentTurn ? 'ring-2 ring-yellow-500' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">{player.username}</span>
                  {isCurrentPlayer && <span className="text-xs text-yellow-600 font-medium">(You)</span>}
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

              <div className="flex items-center justify-center gap-2">
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
                    disabled={loading}
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
              const payout = player.status === 'blackjack'
                ? Math.floor(player.bet * 2.5)
                : player.status === 'win'
                ? player.bet * 2
                : player.status === 'push'
                ? player.bet
                : 0;

              const profit = payout - player.bet;

              return (
                <div key={player.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <span className="font-medium text-gray-900 dark:text-white">{player.username}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${
                      player.status === 'win' || player.status === 'blackjack' ? 'text-green-600' :
                      player.status === 'loss' ? 'text-red-600' :
                      'text-yellow-600'
                    }`}>
                      {player.status.toUpperCase()}
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

          <div className="text-center">
            <Button onClick={() => navigate('/lobby')} size="lg">Back to Lobby</Button>
          </div>
        </div>
      )}
    </div>
  );
}
