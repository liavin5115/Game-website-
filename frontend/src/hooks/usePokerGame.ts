import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGameSocket } from './useGameSocket';
import { gamesApi, lobbyApi } from '../api/client';
import { Game, LobbyGame } from '../types';
import { useAuthStore } from '../stores/authStore';

interface UsePokerGameOptions {
  gameId: number | null;
  enabled?: boolean;
}

export function usePokerGame({ gameId, enabled = true }: UsePokerGameOptions) {
  const queryClient = useQueryClient();
  const { isConnected, showReconnectBanner, reconnect } = useGameSocket(gameId);

  // Fetch game state
  const { data: game, isLoading, error, refetch } = useQuery({
    queryKey: ['game', gameId],
    queryFn: () => gamesApi.get(gameId!).then(r => r.data as Game),
    enabled: enabled && !!gameId,
    staleTime: 0,
    refetchInterval: false,
  });

  // Clock offset for turn timer sync
  const clockOffsetRef = { current: 0 };
  if (game?.server_time) {
    const serverTime = new Date(game.server_time).getTime();
    const localTime = Date.now();
    clockOffsetRef.current = serverTime - localTime;
  }

  const getServerTime = () => Date.now() + clockOffsetRef.current;

  // Mutations
  const actionMutation = useMutation({
    mutationFn: (data: { action: string; amount?: number; turn_seq: number }) =>
      gamesApi.action({ game_id: gameId!, ...data }).then(r => r.data as Game),
    onSuccess: () => {
      // Don't invalidate - WS will push state_changed
    },
    onError: (err: any) => {
      if (err.response?.status === 409) {
        // Turn expired or not your turn - silent refetch
        refetch();
      }
    },
  });

  const leaveMutation = useMutation({
    mutationFn: () => gamesApi.leave({ game_id: gameId! }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lobby'] });
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
    },
  });

  const startMutation = useMutation({
    mutationFn: () => gamesApi.start({ game_id: gameId! }).then(r => r.data as Game),
  });

  // Helpers - find my player by current user's id
  const currentUser = useAuthStore.getState().user;
  const myPlayer = game?.players?.find(p => p.id === currentUser?.id);
  const myStatePlayer = game?.state?.players?.find(p => p.id === currentUser?.id);
  const isMyTurn = game?.current_turn_user_id === currentUser?.id;
  const validActions = game?.my_valid_actions || [];

  return {
    // State
    game,
    isLoading,
    error,
    isConnected,
    showReconnectBanner,
    clockOffset: clockOffsetRef.current,
    getServerTime,

    // Player info
    myPlayer,
    myStatePlayer,
    isMyTurn,
    validActions,

    // Mutations
    action: actionMutation.mutateAsync,
    leave: leaveMutation.mutateAsync,
    start: startMutation.mutateAsync,
    isActionPending: actionMutation.isPending,
    isLeavePending: leaveMutation.isPending,
    isStartPending: startMutation.isPending,

    // Helpers
    refetch,
    reconnect,
  };
}

// Hook for lobby games list
export function useLobbyGames(gameType?: string) {
  return useQuery({
    queryKey: ['lobby', gameType],
    queryFn: () => lobbyApi.games(gameType).then(r => r.data as LobbyGame[]),
    refetchInterval: 5000,
  });
}