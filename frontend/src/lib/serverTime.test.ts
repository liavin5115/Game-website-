import { describe, expect, it } from 'vitest';
import { computeClockOffset, parseServerDate, remainingSeconds } from './serverTime';

const UTC_9AM = Date.UTC(2026, 9, 23, 9, 0, 0);

describe('parseServerDate', () => {
  it('parses a Z-suffixed datetime as UTC', () => {
    expect(parseServerDate('2026-10-23T09:00:00Z')).toBe(UTC_9AM);
    expect(parseServerDate('2026-10-23T09:00:00.123456Z')).toBe(UTC_9AM + 123);
  });

  it('parses +00:00 as UTC', () => {
    expect(parseServerDate('2026-10-23T09:00:00+00:00')).toBe(UTC_9AM);
    expect(parseServerDate('2026-10-23T09:00:00.123456+00:00')).toBe(UTC_9AM + 123);
  });

  it('treats a naive datetime (no zone) as UTC, not local time', () => {
    // This is the SQLite case: "2026-10-23T09:00:00.123456"
    expect(parseServerDate('2026-10-23T09:00:00.123456')).toBe(UTC_9AM + 123);
    expect(parseServerDate('2026-10-23T09:00:00')).toBe(UTC_9AM);
  });

  it('returns null for empty or invalid input', () => {
    expect(parseServerDate(null)).toBeNull();
    expect(parseServerDate(undefined)).toBeNull();
    expect(parseServerDate('')).toBeNull();
    expect(parseServerDate('not-a-date')).toBeNull();
  });
});

describe('remainingSeconds with a wrong client clock', () => {
  const CLOCK_SKEW_MS = 5 * 60 * 1000; // client clock is +5 minutes
  const serverNow = UTC_9AM;
  const clientNow = serverNow + CLOCK_SKEW_MS;
  const deadline = new Date(serverNow + 30_000).toISOString();

  it('computes a -5 minute offset when the client is 5 minutes ahead', () => {
    const offset = computeClockOffset('2026-10-23T09:00:00Z', clientNow);
    expect(offset).toBe(-CLOCK_SKEW_MS);
  });

  it('shows 30s at the deadline start despite the +5 minute skew', () => {
    const offset = -CLOCK_SKEW_MS;
    expect(remainingSeconds(deadline, offset, clientNow)).toBe(30);
  });

  it('decreases every second and clamps at 0', () => {
    const offset = -CLOCK_SKEW_MS;
    expect(remainingSeconds(deadline, offset, clientNow + 1_000)).toBe(29);
    expect(remainingSeconds(deadline, offset, clientNow + 10_000)).toBe(20);
    expect(remainingSeconds(deadline, offset, clientNow + 29_000)).toBe(1);
    expect(remainingSeconds(deadline, offset, clientNow + 30_000)).toBe(0);
    expect(remainingSeconds(deadline, offset, clientNow + 60_000)).toBe(0);
  });

  it('accepts a naive deadline string from old payloads', () => {
    const offset = -CLOCK_SKEW_MS;
    const naiveDeadline = '2026-10-23T09:00:30.000000';
    expect(remainingSeconds(naiveDeadline, offset, clientNow)).toBe(30);
  });
});
