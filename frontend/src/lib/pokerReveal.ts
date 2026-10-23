import { FOLD_REVEAL_SECONDS, REVEAL_SECONDS } from '../config/poker';
import { parseServerDate } from './serverTime';

export function revealDurationMs(showdown: boolean): number {
  return (showdown ? REVEAL_SECONDS : FOLD_REVEAL_SECONDS) * 1000;
}

/**
 * Milliseconds left in the reveal window. Anchored to the server's
 * `finished_at`, never to the moment this component mounted, so refreshes
 * resume the remaining time. The result can never be delayed beyond the
 * configured duration.
 */
export function revealRemainingMs(
  finishedAt: string | null | undefined,
  offsetMs: number,
  nowMs: number = Date.now(),
  durationMs: number = revealDurationMs(true),
): number {
  const finishedMs = parseServerDate(finishedAt);
  if (finishedMs == null) return 0;
  const elapsed = nowMs + offsetMs - finishedMs;
  return Math.max(0, Math.min(durationMs, durationMs - elapsed));
}

/** Whole seconds shown in the banner; clamped to the configured duration. */
export function revealRemainingSeconds(
  finishedAt: string | null | undefined,
  offsetMs: number,
  nowMs: number = Date.now(),
  durationMs: number = revealDurationMs(true),
): number {
  const remaining = revealRemainingMs(finishedAt, offsetMs, nowMs, durationMs);
  return Math.max(0, Math.min(Math.ceil(durationMs / 1000), Math.ceil(remaining / 1000)));
}
