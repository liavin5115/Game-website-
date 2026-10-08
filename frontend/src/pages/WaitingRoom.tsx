/** Waiting room for games */
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { gamesApi, authApi } from '../api/client';
import { useAuthStore } from '../stores/authStore';
import { useGameSocket } from '../hooks/useGameSocket';
import { Button } from '../components/common/Button';

export default function WaitingRoom() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [leaving, setLeaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const numericGameId = Number(gameId);

  // Enable WebSocket for this game
  useGameSocket(numericGameId);

  // Fetch game state
  const { data: game, isLoading } = useQuery({
    queryKey: ['game', numericGameId],
    queryFn: async () => {
      const res = await gamesApi.get(numericGameId);
      return res.data;
    },
    refetchInterval: 2000, // Poll backup
  });

  // Redirect based on game status
  useEffect(() => {
    if (!game) return;

    if (game.status === 'in_progress') {
      navigate(`/game/${gameId}`);
    } else if (game.status === 'finished' || game.status === 'cancelled') {
      navigate('/lobby');
    }
  }, [game?.status, gameId, navigate]);

  // Check if current user is in this game
  const myId = user?.id;
  const isHost = game?.host_id === myId;
  const isInGame = game?.players.some((p: any) => p.id === myId);
  const canStart = (game?.players.length || 0) >= (game?.min_players || 0);

  const handleLeave = async () => {
    if (!gameId) return;

    setLeaving(true);
    setError('');

    try {
      await gamesApi.leave({ game_id: Number(gameId) });

      // Refresh balance
      const meRes = await authApi.me();
      useAuthStore.getState().setAuth(meRes.data, localStorage.getItem('access_token') || '');

      navigate('/lobby');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to leave game');
    } finally {
      setLeaving(false);
    }
  };

  const handleStart = async () => {
    if (!gameId) return;

    setStarting(true);
    setError('');

    try {
      await gamesApi.start({ game_id: Number(gameId) });
      // Game status will change to in_progress, useEffect will redirect
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to start game');
    } finally {
      setStarting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-gold-500 border-t-transparent" />
      </div>
    );
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Game not found</p>
          <Button onClick={() => navigate('/lobby')}>Back to Lobby</Button>
        </div>
      </div>
    );
  }

  // User not in game - redirect to lobby
  if (!isInGame) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">You're not in this game</p>
          <Button onClick={() => navigate('/lobby')}>Back to Lobby</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {game.game_type === 'blackjack' ? '♣ Blackjack' : '♠ Poker'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Buy-in: {game.buy_in} pts • Pot: {game.pot} pts
            </p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {game.players.length}/{game.max_players} players
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Min: {game.min_players}
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Players list */}
        <div className="mb-6 space-y-2">
          {game.players.map((player: any) => (
            <div
              key={player.id}
              className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gold-500 rounded-full flex items-center justify-center text-white font-bold">
                  {player.username[0].toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {player.username}
                    {player.id === game.host_id && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-gold-500 text-white rounded">
                        Host
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Seat {player.seat}
                  </p>
                </div>
              </div>
              {player.id === myId && (
                <span className="text-sm text-gold-600 dark:text-gold-400 font-medium">You</span>
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={handleLeave}
            loading={leaving}
            className="flex-1"
          >
            Leave
          </Button>

          {isHost ? (
            <Button
              onClick={handleStart}
              loading={starting}
              disabled={!canStart}
              className="flex-1"
              title={!canStart ? `Need at least ${game.min_players} players` : undefined}
            >
              {canStart ? 'Start Game' : `Need ${game.min_players - game.players.length} more`}
            </Button>
          ) : (
            <div className="flex-1 text-center text-gray-500 dark:text-gray-400 py-2">
              Waiting for host to start...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
