export interface SeatPoint {
  x: number;
  y: number;
  /** Degrees. 90 = bottom center, increasing clockwise. */
  angle: number;
}

/**
 * Where a seat sits relative to "me": 0 is me (bottom center), and the others
 * run clockwise. `seatIndex` and `mySeatIndex` are absolute table seats.
 */
export function relativeSeatIndex(seatIndex: number, mySeatIndex: number, n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return (((seatIndex - mySeatIndex) % n) + n) % n;
}

/**
 * Layout for `n` seats as seen by "me". Index 0 is the bottom-center seat
 * (relativeSeatIndex 0) and indexes increase clockwise.
 *
 * Seats are spaced by equal *arc length*, not equal angle: equal angles bunch
 * seats together on the narrow sides of the ellipse and make them overlap at
 * 6-10 players.
 */
export function seatLayout(n: number): SeatPoint[] {
  const count = Math.max(1, Math.floor(n) || 1);
  const rx = 42;
  const ry = count >= 9 ? 36 : count >= 6 ? 34 : 30;
  const centerX = 50;
  const centerY = 50;
  const SAMPLES = 720;

  const samples: { s: number; x: number; y: number; angle: number }[] = [];
  let total = 0;
  let prevX = 0;
  let prevY = 0;
  for (let k = 0; k <= SAMPLES; k++) {
    const angle = 90 + (360 * k) / SAMPLES;
    const rad = (angle * Math.PI) / 180;
    const x = centerX + rx * Math.cos(rad);
    const y = centerY + ry * Math.sin(rad);
    if (k > 0) total += Math.hypot(x - prevX, y - prevY);
    samples.push({ s: total, x, y, angle });
    prevX = x;
    prevY = y;
  }

  const layout: SeatPoint[] = new Array(count);
  for (let r = 0; r < count; r++) {
    const target = (total * r) / count;
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].s < target) lo = mid + 1;
      else hi = mid;
    }
    const p = samples[lo];
    layout[r] = { x: p.x, y: p.y, angle: p.angle };
  }
  return layout;
}

/**
 * Positions indexed by absolute seat. Each seat is placed at its relative
 * index, so the player whose `mySeatIndex` matches always lands at the bottom.
 */
export function seatPositionsBySeat(n: number, mySeatIndex: number): SeatPoint[] {
  const count = Math.max(1, Math.floor(n) || 1);
  const layout = seatLayout(count);
  const positions: SeatPoint[] = new Array(count);
  for (let seat = 0; seat < count; seat++) {
    positions[seat] = layout[relativeSeatIndex(seat, mySeatIndex, count)];
  }
  return positions;
}
