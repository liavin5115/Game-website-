/** Poker table component with oval layout for 2-10 players */
import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePokerGame } from '../../../hooks/usePokerGame';
import { PokerTableDisplay, type PokerTableDisplayProps } from './PokerTableDisplay';

export function PokerTable({ gameId }: { gameId: number }) {
  const navigate = useNavigate();
  const {
    game,
    isLoading,
    isConnected,
    showReconnectBanner,
    getServerTime,
    myPlayer,
    isMyTurn,
    validActions,
    action: sendAction,
    isActionPending,
    refetch,
  } = usePokerGame({ gameId });

  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState('');
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

    const deadlineMs = new Date(turnDeadline).getTime();

    const tick = () => {
      const now = getServerTime();
      const remainingSec = Math.max(0, Math.ceil((deadlineMs - now) / 1000));
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
  }, [game?.status, game?.turn_deadline, game?.turn_seconds, isMyTurn, getServerTime, refetch]);

  // Redirect if waiting
  useEffect(() => {
    if (game?.status === 'waiting') {
      navigate(`/game/${gameId}/waiting`);
    }
  }, [game?.status, gameId, navigate]);

  // Refresh wallet on finish
  useEffect(() => {
    if (game?.status === 'finished') {
      window.dispatchEvent(new CustomEvent('wallet:refetch'));
    }
  }, [game?.status]);

  const handleAction = useCallback(async (actionType: string, amount?: number) => {
    if (isActionPending) return;
    setError('');

    try {
      await sendAction({ action: actionType, amount: amount || 0, turn_seq: game?.turn_seq || 0 });
    } catch (err: any) {
      if (err.response?.status === 409) {
        refetch();
        setError('Turn expired');
        setTimeout(() => setError(''), 2000);
      } else {
        setError(err.response?.data?.detail || 'Action failed');
      }
    }
  }, [isActionPending, sendAction, game?.turn_seq, refetch]);

  const handleBetAction = useCallback((actionType: string, minAmount: number, maxAmount: number) => {
    // This will be handled by a modal in Part 3
    // For Part 2, just log
    console.log('Bet action:', actionType, minAmount, maxAmount);
  }, []);

  if (isLoading || !game || !game?.state) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-gray-500 dark:text-gray-400">
        Loading game...
      </div>
    );
  }

  const gameState = game.state;
  const metadata = gameState?.metadata || {};
  const street = (metadata.street as number) ?? 0;
  const buttonPos = (metadata.button_pos as number) ?? 0;
  const sbIdx = (metadata.sb_idx as number) ?? 1;
  const bbIdx = (metadata.bb_idx as number) ?? (gameState?.players.length > 2 ? 2 : 0);
  const sbAmount = (metadata.sb_amount as number) ?? 1;
  const bbAmount = (metadata.bb_amount as number) ?? 2;

  const players = gameState?.players || [];
  const me = myPlayer;
  const mySeat = me?.seat ?? 0;
  const numPlayers = players.length;

  // Find current turn player
  const currentTurnIdx = gameState?.current_player ?? 0;
  const currentTurnPlayer = players[currentTurnIdx];
  const currentTurnPlayerName = currentTurnPlayer?.username;

  const turnSeconds = game.turn_seconds ?? 30;
  const isLowTime = remaining <= 5 && remaining > 0;

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
    error,
    handleAction,
    handleBetAction,
  };

  return <PokerTableDisplay {...displayProps} />;
}