import { useCallback, useEffect, useState } from 'react';
import { revealDurationMs, revealRemainingMs } from '../lib/pokerReveal';

/**
 * Owns the short reveal window between a finished hand and the result panel.
 * Called from PokerTable before any early return so hook order stays stable.
 */
export function usePokerReveal(game: any, clockOffset: number) {
  const gameId = game?.id;
  const finished = game?.status === 'finished';
  const activePlayers =
    game?.state?.players?.filter((p: any) => p?.status === 'active').length ?? 0;
  const showdown =
    typeof game?.showdown === 'boolean' ? game.showdown : activePlayers > 1;

  const [skipped, setSkipped] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    setSkipped(false);
    setNowMs(Date.now());
  }, [gameId]);

  useEffect(() => {
    if (!finished || skipped) return;
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [finished, skipped, gameId, game?.finished_at]);

  const durationMs = revealDurationMs(showdown);
  const remainingMs = finished
    ? revealRemainingMs(game?.finished_at, clockOffset, nowMs, durationMs)
    : 0;
  const revealActive = finished && !skipped && remainingMs > 0;
  const showResult = finished && (skipped || remainingMs <= 0);
  const skip = useCallback(() => setSkipped(true), []);

  return {
    showdown,
    revealActive,
    showResult,
    remainingMs,
    remainingSeconds: Math.max(0, Math.ceil(remainingMs / 1000)),
    skip,
  };
}
