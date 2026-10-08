/** Lobby game list component */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lobbyApi, gamesApi } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { useLobbySocket } from '../../hooks/useLobbySocket';
import type { LobbyGame } from '../../types';
import { Button } from '../common/Button';
import { Modal } from '../common/Modal';

const gameTypeLabels: Record<string, string> = {
  poker: '♠ Poker',
  blackjack: '♣ Blackjack',
};

export function GameList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isVerified } = useAuthStore();
  const [selectedType, setSelectedType] = useState<string>('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createForm, setCreateForm] = useState({ game_type: 'blackjack', buy_in: 100 });

  // Enable lobby WebSocket
  useLobbySocket();

  // Fetch game types
  const { data: gameTypes = [] } = useQuery({
    queryKey: ['games', 'types'],
    queryFn: async () => {
      const res = await gamesApi.types();
      return res.data;
    },
    enabled: isAuthenticated && isVerified,
  });

  // Fetch lobby games
  const { data: lobbyGames = [], isLoading } = useQuery({
    queryKey: ['lobby', 'games', selectedType],
    queryFn: async () => {
      const res = await lobbyApi.games(selectedType || undefined);
      return res.data;
    },
    enabled: isAuthenticated && isVerified,
    refetchInterval: (isAuthenticated && isVerified) ? 5000 : false, // Poll every 5s as backup
  });

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setCreateLoading(true);

    try {
      const res = await gamesApi.create({
        game_type: createForm.game_type,
        buy_in: Number(createForm.buy_in)
      });
      setShowCreateModal(false);
      navigate(`/game/${res.data.id}/waiting`);
    } catch (err: any) {
      setCreateError(err.response?.data?.detail || 'Failed to create game');
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoin = async (game: LobbyGame) => {
    try {
      await gamesApi.join({ game_id: game.id });
      // Refresh user balance after join
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
      navigate(`/game/${game.id}/waiting`);
    } catch (err: any) {
      alert(err.response?.data?.detail || 'Failed to join game');
    }
  };

  const canJoin = (game: LobbyGame): { allowed: boolean; reason?: string } => {
    const myId = user?.id;
    const isMyGame = game.players.some(p => p.id === myId);
    const isFull = game.players.length >= game.max_players;
    const canAfford = (user?.points || 0) >= game.buy_in;

    if (isMyGame) return { allowed: false, reason: 'Already joined' };
    if (isFull) return { allowed: false, reason: 'Game full' };
    if (!canAfford) return { allowed: false, reason: `Need ${game.buy_in} pts` };
    return { allowed: true };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Game Lobby</h2>

        <div className="flex gap-3">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
          >
            <option value="">All Games</option>
            {gameTypes.map((gt: any) => (
              <option key={gt.type} value={gt.type}>
                {gt.name}
              </option>
            ))}
          </select>

          <Button onClick={() => setShowCreateModal(true)}>Create Game</Button>
        </div>
      </div>

      {/* Game list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading games...</div>
        ) : lobbyGames.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No waiting games. <Button variant="ghost" onClick={() => setShowCreateModal(true)}>Create one?</Button>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {lobbyGames.map((game: LobbyGame) => {
              const joinCheck = canJoin(game);
              const myId = user?.id;
              const isMyGame = game.players.some(p => p.id === myId);

              return (
                <div key={game.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{gameTypeLabels[game.game_type] || game.game_type}</span>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">
                        {game.players[0]?.username || 'Unknown'}'s game
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {game.players.length}/{game.max_players} players • Buy-in: {game.buy_in} pts
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">
                      Pot: {game.pot} pts
                    </span>

                    {isMyGame ? (
                      <Button size="sm" onClick={() => navigate(`/game/${game.id}/waiting`)}>
                        Open
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={!joinCheck.allowed}
                        onClick={() => handleJoin(game)}
                        title={joinCheck.reason}
                      >
                        {joinCheck.allowed ? 'Join' : joinCheck.reason}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Game">
        <form onSubmit={handleCreateGame} className="space-y-4">
          {createError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              {createError}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Game Type</label>
            <select
              value={createForm.game_type}
              onChange={(e) => setCreateForm({ ...createForm, game_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            >
              {gameTypes.map((gt: any) => (
                <option key={gt.type} value={gt.type}>
                  {gt.name} (Default: {gt.default_buy_in} pts)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Buy-in</label>
            <input
              type="number"
              value={createForm.buy_in}
              onChange={(e) => setCreateForm({ ...createForm, buy_in: Number(e.target.value) || 0 })}
              min={10}
              max={user?.points || 10000}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
            />
            <p className="text-sm text-gray-500 mt-1">Balance: {user?.points || 0} pts</p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" loading={createLoading} className="flex-1">
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
