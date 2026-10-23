/** Poker table component with oval layout for 2-10 players */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePokerGame } from '../../../hooks/usePokerGame';
import { usePokerReveal } from '../../../hooks/usePokerReveal';
import { gamesApi } from '../../../api/client';
import { PokerTableDisplay, type PokerTableDisplayProps } from './PokerTableDisplay';
import { authApi } from '../../../api/client';
import { useAuthStore } from '../../../stores/authStore';
import { remainingSeconds } from '../../../lib/serverTime';
import { Button } from '../../common/Button';

export function PokerTable({ gameId }: { gameId: number }) {
  const navigate = useNavigate();
  const { user, updatePoints } = useAuthStore();
  const {
    game,
    isLoading,
    error: loadError,
    isConnected,
    showReconnectBanner,
    clockOffset,
    myPlayer,
    isMyTurn,
    validActions,
    action: sendAction,
    isActionPending,
    refetch,
  } = usePokerGame({ gameId });

  // Must be above every early return in this component.
  const reveal = usePokerReveal(game, clockOffset);

  const [remaining, setRemaining] = useState(0);
  const [actionError, setActionError] = useState('');
  const [showBetModal, setShowBetModal] = useState(false);
  const [pendingBetAction, setPendingBetAction] = useState<'bet' | 'raise' | null>(null);
  const [betAmount, setBetAmount] = useState(0);
  const [betMaxAmount, setBetMaxAmount] = useState(0);
  const [showFoldConfirm, setShowFoldConfirm] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [rematchLoading, setRematchLoading] = useState(false);
  const countdownIntervalRef = useRef<number>();
  const refetchTimeoutRef = useRef<number>();

  // Update remaining time
  useEffect(() => {
    const turnDeadline = game?.turn_deadline;
    const isInProgress = game?.status === 'in_progress';

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

    const tick = () => {
      const wallNow = Date.now();
      const remainingSec = remainingSeconds(turnDeadline, clockOffset, wallNow);
      setRemaining(remainingSec);

      if (remainingSec <= 0 && isMyTurn && !refetchTimeoutRef.current) {
        refetchTimeoutRef.current = window.setTimeout(() => {
          refetch();
        }, 2000);
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
  }, [game?.status, game?.turn_deadline, game?.turn_seconds, game?.turn_seq, isMyTurn, refetch, clockOffset]);

  // A new turn or street invalidates any open bet/raise modal: the old amount
  // and limits no longer match the server state.
  useEffect(() => {
    setShowBetModal(false);
    setPendingBetAction(null);
  }, [game?.turn_seq, game?.state?.phase]);

  // Redirect if waiting
  useEffect(() => {
    if (game?.status === 'waiting') {
      navigate(`/game/${gameId}/waiting`);
    }
  }, [game?.status, gameId, navigate]);

  // Refresh wallet on finish
  useEffect(() => {
    if (game?.status === 'finished') {
      authApi.me().then(res => {
        updatePoints(res.data.points);
      });
      window.dispatchEvent(new CustomEvent('wallet:refetch'));
    }
  }, [game?.status, updatePoints]);

  const handleAction = useCallback(async (actionType: string, amount?: number) => {
    if (isActionPending) return;
    setActionError('');

    try {
      await sendAction({ action: actionType, amount: Math.trunc(amount || 0), turn_seq: game?.turn_seq ?? 0 });
    } catch (err: any) {
      if (err.response?.status === 409) {
        // The server already advanced the turn (timeout or another actor).
        refetch();
        setActionError('Your turn expired — table refreshed');
        setTimeout(() => setActionError(''), 3000);
      } else {
        // Never hide the reason: show the server detail.
        setActionError(err.response?.data?.detail || 'Action failed');
      }
    }
  }, [isActionPending, sendAction, game?.turn_seq, refetch]);

  const openBetModal = useCallback((actionType: 'bet' | 'raise', minAmount: number) => {
    // Use PlayerState (game.state.players) — game.players is GamePlayer where
    // `bet` is the buy-in and `chips` does not exist.
    const meState = game?.state?.players?.find((p: any) => p.id === (myPlayer as any)?.id);
    const limits = game?.my_action_limits;
    const fallbackMax = Number(meState?.chips ?? 0) + Number(meState?.bet ?? 0);
    const maxAmount = Math.max(0, Math.trunc(Number(limits?.max_bet_to ?? fallbackMax)));
    const safeMin = Math.max(0, Math.min(maxAmount, Math.ceil(Number(minAmount) || 0)));
    setPendingBetAction(actionType);
    setBetAmount(safeMin);
    setBetMaxAmount(maxAmount);
    setShowBetModal(true);
  }, [game, myPlayer]);

  const confirmBet = useCallback(() => {
    if (pendingBetAction) {
      handleAction(pendingBetAction, betAmount);
      setShowBetModal(false);
      setPendingBetAction(null);
    }
  }, [pendingBetAction, betAmount, handleAction]);

  const handleFold = useCallback(() => {
    // If check is available, folding is free - require confirmation
    if (validActions.includes('check')) {
      setShowFoldConfirm(true);
    } else {
      handleAction('fold');
    }
  }, [validActions, handleAction]);

  const confirmFold = useCallback(() => {
    handleAction('fold');
    setShowFoldConfirm(false);
  }, [handleAction]);

  const handleRematch = useCallback(async () => {
    if (rematchLoading || !game) return;
    setRematchLoading(true);
    setActionError('');

    try {
      const res = await gamesApi.rematch({ game_id: gameId });
      const newGame = res.data;

      const meRes = await authApi.me();
      updatePoints(meRes.data.points);

      navigate(`/game/${newGame.id}/waiting`);
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Rematch failed';
      if (err.response?.status === 409) {
        setActionError(detail);
      } else {
        setActionError(detail);
      }
    } finally {
      setRematchLoading(false);
    }
  }, [rematchLoading, game, gameId, updatePoints, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-gold-500 border-t-transparent mx-auto mb-4" />
          <p>Loading game...</p>
        </div>
      </div>
    );
  }

  if (loadError || !game || !game.state) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-gray-500 dark:text-gray-400">
        <div className="text-center">
          <p className="text-red-500 dark:text-red-400 mb-4">
            {loadError ? (loadError as any)?.message || 'Failed to load game' : 'Game not found'}
          </p>
          <Button onClick={() => refetch()} variant="primary">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const gameState = game.state;
  const metadata = gameState?.metadata || {};
  const street = (metadata.street as number) ?? 0;
  const buttonPos = (metadata.button_pos as number) ?? 0;
  const sbIdx = (metadata.sb_idx as number) ?? 1;
  const bbIdx = (metadata.bb_idx as number) ?? ((gameState?.players?.length ?? 0) > 2 ? 2 : 0);
  const sbAmount = (metadata.sb_amount as number) ?? 1;
  const bbAmount = (metadata.bb_amount as number) ?? 2;

  const players = gameState?.players || [];
  // me should be a PlayerState from gameState.players, not a GamePlayer from game.players
  const me = players.find((p: any) => p.id === (myPlayer as any)?.id) || players[0];
  // The absolute seat that "me" occupies. GamePlayer carries `seat`; watchers
  // (not seated) fall back to seat 0 so seat 0 still renders at the bottom.
  const mySeat = game?.players?.find((p) => p.id === (myPlayer as any)?.id)?.seat ?? 0;
  const numPlayers = players.length;

  // Find current turn player. Finished hands have no turn, even if an old
  // snapshot still carries a stale current_player index.
  const currentTurnIdx = game?.status === 'finished' ? -1 : (gameState?.current_player ?? 0);
  const currentTurnPlayer = currentTurnIdx >= 0 ? players[currentTurnIdx] : undefined;
  const currentTurnPlayerName = currentTurnPlayer?.username;

  const turnSeconds = game?.turn_seconds ?? 30;
  const isLowTime = remaining <= 5 && remaining > 0;

  const canCheck = validActions.includes('check');

  // Min/max come only from the server: my_action_limits is computed from the
  // authoritative game state on every GET. Fall back to server state fields.
  const currentBet = gameState?.current_bet ?? 0;
  const myBet = me?.bet ?? 0;
  const callAmount = currentBet - myBet;
  const betMin = game?.my_action_limits?.min_bet_to ?? (gameState?.min_raise ?? bbAmount);
  const raiseMin = game?.my_action_limits?.min_raise_to ?? (currentBet + (gameState?.min_raise ?? bbAmount));

  const isShowdown = gameState?.phase === 'showdown' || reveal.showdown;

  const displayProps: PokerTableDisplayProps = {
    game,
    gameState,
    players,
    me,
    mySeat,
    numPlayers,
    street,
    buttonPos,
    sbIdx,
    bbIdx,
    sbAmount,
    bbAmount,
    currentTurnIdx,
    currentTurnPlayerName,
    turnSeconds,
    remaining,
    isLowTime,
    validActions,
    isMyTurn,
    isActionPending,
    isConnected,
    showReconnectBanner,
    error: actionError,
    isShowdown,
    showRules,
    setShowRules,
    handleAction,
    handleFold,
    openBetModal,
    betMin,
    raiseMin,
    callAmount,
    canCheck,
    // Bet modal props
    betMaxAmount,
    showBetModal,
    setShowBetModal,
    pendingBetAction,
    betAmount,
    setBetAmount,
    confirmBet,
    // Fold confirm props
    showFoldConfirm,
    setShowFoldConfirm,
    confirmFold,
    // Result / reveal props
    results: game?.results ?? [],
    winners: game?.winners ?? [],
    winningCards: game?.winning_cards ?? [],
    potTotal: game?.pot_total ?? gameState?.pot ?? 0,
    showResult: reveal.showResult,
    revealActive: reveal.revealActive,
    revealRemaining: reveal.remainingSeconds,
    onSkipReveal: reveal.skip,
    showdown: reveal.showdown,
    // Finished panel props
    nextGameId: game?.next_game_id ?? null,
    buyIn: game?.buy_in ?? 0,
    userPoints: user?.points,
    onRematch: handleRematch,
    onBackToLobby: () => navigate('/lobby'),
    rematchLoading,
  };

  return <PokerTableDisplay {...displayProps} />;
}