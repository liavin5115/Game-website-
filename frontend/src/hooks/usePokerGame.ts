import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGameSocket } from './useGameSocket';
import { gamesApi, lobbyApi } from '../api/client';
import { Game, LobbyGame } from '../types';
import { useAuthStore } from '../stores/authStore';
import { useCallback, useRef } from 'react';
import { computeClockOffset } from '../lib/serverTime';

interface UsePokerGameOptions {
  gameId: number | null;
  enabled?: boolean;
}

export function usePokerGame({ gameId, enabled = true }: UsePokerGameOptions) {
  const queryClient = useQueryClient();
  const { isConnected, showReconnectBanner, reconnect } = useGameSocket(gameId);

  // Ignore out-of-order GET responses: keep the snapshot with the highest turn_seq.
  const appliedRef = useRef<{ gameId: number | null; seq: number; data: Game | null }>({
    gameId: null,
    seq: -1,
    data: null,
  });

  // Fetch game state
  const { data: game, isLoading, error, refetch } = useQuery({
    queryKey: ['game', gameId],
    queryFn: async () => {
      const next = (await gamesApi.get(gameId!)).data as Game;
      const seq = typeof next.turn_seq === 'number' ? next.turn_seq : 0;
      const prev = appliedRef.current;
      if (prev.gameId === gameId && prev.data && seq < prev.seq) {
        return prev.data; // older response arrived late; do not overwrite newer state
      }
      appliedRef.current = { gameId, seq, data: next };
      return next;
    },
    enabled: enabled && !!gameId,
    staleTime: 0,
    refetchInterval: false,
  });

  // Clock sync: recompute the offset ONLY when the server_time value changes.
  // Recomputing on every render used a frozen server_time with a fresh
  // Date.now(), which dragged the virtual clock backwards and froze the timer.
  const clockRef = useRef<{ serverTime: string | null; offsetMs: number }>({
    serverTime: null,
    offsetMs: 0,
  });
  if (game?.server_time && game.server_time !== clockRef.current.serverTime) {
    clockRef.current = {
      serverTime: game.server_time,
      offsetMs: computeClockOffset(game.server_time, Date.now()),
    };
  }

  const getServerTime = useCallback(() => Date.now() + clockRef.current.offsetMs, []);
  const clockOffset = clockRef.current.offsetMs;

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
    clockOffset,
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