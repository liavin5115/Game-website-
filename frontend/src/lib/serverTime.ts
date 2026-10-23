/**
 * Time helpers shared by the poker table.
 *
 * SQLite stores naive UTC datetimes and older payloads may omit the zone.
 * A missing zone MUST be interpreted as UTC, never as local time.
 */

/** Parse an API datetime. Missing zone => UTC. Returns epoch ms or null. */
export function parseServerDate(value: string | null | undefined): number | null {
  if (!value) return null;
  let s = value.trim();
  if (!s) return null;
  // Accept Z, +00:00, +0000, -05:00 etc.
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(s);
  if (!hasZone) s += 'Z';
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? null : ms;
}

/** offset = server clock - client clock (ms). Missing/invalid server time => 0. */
export function computeClockOffset(
  serverTime: string | null | undefined,
  receivedAtMs: number = Date.now(),
): number {
  const serverMs = parseServerDate(serverTime);
  if (serverMs == null) return 0;
  return serverMs - receivedAtMs;
}

/**
 * Whole seconds left, clamped at 0. `nowMs` is the client clock; `offsetMs`
 * converts it to server time. Computed from the deadline string each tick so
 * a wrong/skewed client clock cancels out.
 */
export function remainingSeconds(
  deadline: string | null | undefined,
  offsetMs: number,
  nowMs: number = Date.now(),
): number {
  const deadlineMs = parseServerDate(deadline);
  if (deadlineMs == null) return 0;
  return Math.max(0, Math.ceil((deadlineMs - (nowMs + offsetMs)) / 1000));
}
