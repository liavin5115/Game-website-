import { relativeSeatIndex } from './pokerSeat';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface PlacedSeat {
  /** Center x in px (container coordinates). */
  x: number;
  /** Center y in px (container coordinates). */
  y: number;
  /** True when the seat had to be nudged out of the center safe zone. */
  pushedOut: boolean;
}

export interface TableLayout {
  seats: PlacedSeat[];
  /** Center safe zone (community cards + street + pot + message) in px. */
  zone: Rect;
  /**
   * False when a seat could not be pushed clear of the zone inside the
   * container (i.e. the table is too small for the current sizing constants).
   */
  ok: boolean;
}

export interface LayoutParams {
  width: number;
  height: number;
  /** Total seats. */
  n: number;
  mySeat: number;
  seatW: number;
  seatH: number;
  zoneW: number;
  zoneH: number;
  /** Minimum gap kept between a seat and the zone, and a seat and the edge. */
  margin: number;
}

function clamp(v: number, lo: number, hi: number) {
  if (hi < lo) return (lo + hi) / 2;
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Place `n` seats around an ellipse that hugs the table rim, then guarantee
 * that no seat enters the reserved center zone (community cards / street / pot
 * / message).
 *
 * Seats are spaced by equal *arc length*, not equal angle: on a wide ellipse
 * equal angles bunch two seats together at the left and right ends (they stack
 * almost vertically and overlap at 10 players), while equal arc length spreads
 * them evenly around the rim.
 *
 * Each seat is a fixed-size box centered on the returned point. If a seat would
 * intrude into the zone expanded by the seat half-size plus `margin`, it is
 * pushed along the axis of least penetration until it is exactly clear. It is
 * then clamped inside the container so it never crosses the rim.
 */
export function computeTableLayout(p: LayoutParams): TableLayout {
  const { width: W, height: H, n, mySeat, seatW, seatH, zoneW, zoneH, margin } = p;
  const cx = W / 2;
  const cy = H / 2;
  const halfW = seatW / 2;
  const halfH = seatH / 2;
  const zoneLeft = cx - zoneW / 2;
  const zoneTop = cy - zoneH / 2;
  const zone: Rect = {
    left: zoneLeft,
    top: zoneTop,
    right: zoneLeft + zoneW,
    bottom: zoneTop + zoneH,
  };

  const rx = Math.max(0, W / 2 - halfW - margin);
  const ry = Math.max(0, H / 2 - halfH - margin);
  // Zone expanded by the seat half-size and the minimum gap: a seat center must
  // sit outside this rectangle. +1px absorbs sub-pixel layout rounding so the
  // rendered gap never dips below the requested minimum.
  const gap = margin + 1;
  const ex = zoneW / 2 + halfW + gap;
  const ey = zoneH / 2 + halfH + gap;

  const count = Math.max(1, Math.floor(n) || 1);

  // Sample the rim and walk it by equal arc length, starting at the bottom
  // center (angle 90deg) and going clockwise.
  const SAMPLES = 1440;
  const xs: number[] = new Array(SAMPLES + 1);
  const ys: number[] = new Array(SAMPLES + 1);
  const arc: number[] = new Array(SAMPLES + 1);
  let total = 0;
  let prevX = 0;
  let prevY = 0;
  for (let k = 0; k <= SAMPLES; k++) {
    const rad = ((90 + (360 * k) / SAMPLES) * Math.PI) / 180;
    const x = cx + rx * Math.cos(rad);
    const y = cy + ry * Math.sin(rad);
    if (k > 0) total += Math.hypot(x - prevX, y - prevY);
    xs[k] = x;
    ys[k] = y;
    arc[k] = total;
    prevX = x;
    prevY = y;
  }

  const seats: PlacedSeat[] = new Array(count);
  let ok = true;

  for (let seat = 0; seat < count; seat++) {
    const r = relativeSeatIndex(seat, mySeat, count);
    const target = (total * r) / count;
    let lo = 0;
    let hi = SAMPLES;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arc[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    let x = xs[lo];
    let y = ys[lo];

    const dx = x - cx;
    const dy = y - cy;
    let pushedOut = false;
    if (Math.abs(dx) < ex && Math.abs(dy) < ey) {
      pushedOut = true;
      const needX = ex - Math.abs(dx);
      const needY = ey - Math.abs(dy);
      if (needX <= needY) {
        x = cx + (dx >= 0 ? ex : -ex);
      } else {
        y = cy + (dy >= 0 ? ey : -ey);
      }
    }

    x = clamp(x, margin + halfW, W - margin - halfW);
    y = clamp(y, margin + halfH, H - margin - halfH);

    const clear = Math.abs(x - cx) >= ex - 0.5 || Math.abs(y - cy) >= ey - 0.5;
    if (!clear) ok = false;
    seats[seat] = { x, y, pushedOut };
  }

  return { seats, zone, ok };
}
