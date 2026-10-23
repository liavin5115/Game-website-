import { describe, it, expect } from 'vitest';
import { computeTableLayout, type PlacedSeat, type Rect } from './pokerTableLayout';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// Real desktop seat geometry: my seat is a little larger (md cards) than the
// opponents' (sm cards). These mirror SEAT_METRICS in PokerTableDisplay.tsx.
const OPP = { w: 118, h: 148 };
const ME = { w: 152, h: 183 };
const ZONE_W = 352;
const ZONE_H = 178;
const MARGIN = 16;
const RIM = 6;

// Container sizes used on desktop: the max-w-6xl column at 1366px and the
// padded column at 1024px, both at the 600px min height.
const CONTAINERS = [
  { w: 1152, h: 600 },
  { w: 992, h: 600 },
];
const COUNTS = [2, 6, 10];

function sizeFor(seat: number, mySeat: number): { w: number; h: number } {
  return seat === mySeat ? ME : OPP;
}

function box(seat: PlacedSeat, size: { w: number; h: number }): Box {
  return {
    left: seat.x - size.w / 2,
    top: seat.y - size.h / 2,
    right: seat.x + size.w / 2,
    bottom: seat.y + size.h / 2,
  };
}

/** Negative when the boxes overlap. */
function gap(a: Rect | Box, b: Rect | Box): number {
  const gapX = Math.max(a.left - b.right, b.left - a.right);
  const gapY = Math.max(a.top - b.bottom, b.top - a.bottom);
  return Math.max(gapX, gapY);
}

describe('computeTableLayout', () => {
  for (const container of CONTAINERS) {
    for (const n of COUNTS) {
      const mySeat = Math.min(1, n - 1);
      const layout = computeTableLayout({
        width: container.w,
        height: container.h,
        n,
        mySeat,
        seatW: OPP.w,
        seatH: OPP.h,
        mySeatW: ME.w,
        mySeatH: ME.h,
        zoneW: ZONE_W,
        zoneH: ZONE_H,
        margin: MARGIN,
        rimMargin: RIM,
      });

      it(`places ${n} seats clear of the zone and each other (${container.w}x${container.h})`, () => {
        expect(layout.ok).toBe(true);
        expect(layout.seats).toHaveLength(n);

        const boxes = layout.seats.map((s, i) => box(s, sizeFor(i, mySeat)));

        // 1. Every seat keeps at least `margin` from the reserved center zone.
        for (const b of boxes) {
          expect(gap(b, layout.zone)).toBeGreaterThanOrEqual(MARGIN - 0.5);
        }

        // 2. No two seats overlap.
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            expect(gap(boxes[i], boxes[j])).toBeGreaterThan(0);
          }
        }

        // 3. Every seat stays inside the container rim.
        for (const b of boxes) {
          expect(b.left).toBeGreaterThanOrEqual(RIM - 0.5);
          expect(b.top).toBeGreaterThanOrEqual(RIM - 0.5);
          expect(b.right).toBeLessThanOrEqual(container.w - RIM + 0.5);
          expect(b.bottom).toBeLessThanOrEqual(container.h - RIM + 0.5);
        }
      });
    }
  }

  it('uses the larger my-seat box for my seat and keeps it clear of the zone', () => {
    const mySeat = 3;
    const layout = computeTableLayout({
      width: 1152,
      height: 600,
      n: 10,
      mySeat,
      seatW: OPP.w,
      seatH: OPP.h,
      mySeatW: ME.w,
      mySeatH: ME.h,
      zoneW: ZONE_W,
      zoneH: ZONE_H,
      margin: MARGIN,
      rimMargin: RIM,
    });
    // Absolute seat 3 is "me" -> bottom center; relative seat 5 is opposite.
    expect(layout.seats[3].x).toBeCloseTo(1152 / 2, 0);
    expect(layout.seats[3].y).toBeGreaterThan(600 / 2);
    // The opposite seat sits at the top center (small arc-sampling tolerance).
    expect(Math.abs(layout.seats[8].x - 1152 / 2)).toBeLessThan(5);
    expect(layout.seats[8].y).toBeLessThan(600 / 2);

    const mine = box(layout.seats[3], ME);
    expect(gap(mine, layout.zone)).toBeGreaterThanOrEqual(MARGIN - 0.5);
    expect(mine.bottom).toBeLessThanOrEqual(600 - RIM + 0.5);
  });
});
