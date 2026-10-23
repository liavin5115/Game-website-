import { describe, expect, it } from 'vitest';
import { computeClockOffset } from './serverTime';
import { revealDurationMs, revealRemainingMs, revealRemainingSeconds } from './pokerReveal';

const FINISHED_AT = Date.UTC(2026, 9, 23, 9, 0, 0);
const FINISHED_ISO = '2026-10-23T09:00:00Z';
const CLOCK_SKEW_MS = 5 * 60 * 1000;

describe('poker reveal timing', () => {
  it('resumes the remaining time with a +5 minute client clock offset', () => {
    // The client clock is five minutes ahead of the server.
    const clientNow = FINISHED_AT + 1000 + CLOCK_SKEW_MS;
    const offset = computeClockOffset(
      new Date(FINISHED_AT + 1000).toISOString(),
      clientNow,
    );
    expect(offset).toBe(-CLOCK_SKEW_MS);

    // 1s after the server finished the hand: 4s remain.
    expect(revealRemainingMs(FINISHED_ISO, offset, clientNow)).toBe(4000);
    expect(revealRemainingSeconds(FINISHED_ISO, offset, clientNow)).toBe(4);

    // A refresh 3.5s after finish resumes with 1.5s, not a fresh 5s window.
    expect(revealRemainingMs(FINISHED_ISO, offset, clientNow + 2500)).toBe(1500);
    expect(revealRemainingSeconds(FINISHED_ISO, offset, clientNow + 2500)).toBe(2);
  });

  it('never exceeds the configured duration and expires after it', () => {
    expect(revealRemainingMs(FINISHED_ISO, 0, FINISHED_AT - 5000)).toBe(5000);
    expect(revealRemainingMs(FINISHED_ISO, 0, FINISHED_AT + 6000)).toBe(0);
    expect(revealRemainingMs(FINISHED_ISO, 0, FINISHED_AT + 5000)).toBe(0);
  });

  it('uses a short window for an uncontested pot', () => {
    const duration = revealDurationMs(false);
    expect(duration).toBe(1500);
    expect(revealRemainingMs(FINISHED_ISO, 0, FINISHED_AT, duration)).toBe(1500);
    expect(revealRemainingMs(FINISHED_ISO, 0, FINISHED_AT + 1500, duration)).toBe(0);
  });

  it('shows the result immediately when finished_at is missing', () => {
    expect(revealRemainingMs(null, 0, FINISHED_AT)).toBe(0);
    expect(revealRemainingMs('not-a-date', 0, FINISHED_AT)).toBe(0);
  });
});
