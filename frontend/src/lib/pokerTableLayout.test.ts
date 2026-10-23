import { describe, it, expect } from 'vitest';
import { computeTableLayout, type PlacedSeat, type Rect } from './pokerTableLayout';

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const SEAT = {
  normal: { w: 128, h: 140 },
  compact: { w: 112, h: 128 },
};
const ZONE_W = 352;
const ZONE_H = 178;
const MARGIN = 16;

// Container sizes used on desktop. The table is max-w-6xl at 1366px wide and
// the padded column width at 1024px; both use the same 72vh height cap.
const CONTAINERS = [
  { w: 1152, h: 553 },
  { w: 992, h: 553 },
];
const COUNTS = [2, 6, 10];

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
      const size = n >= 6 ? SEAT.compact : SEAT.normal;
      const layout = computeTableLayout({
        width: container.w,
        height: container.h,
        n,
        mySeat: 0,
        seatW: size.w,
        seatH: size.h,
        zoneW: ZONE_W,
        zoneH: ZONE_H,
        margin: MARGIN,
      });

      it(`places ${n} seats clear of the zone and each other (${container.w}x${container.h})`, () => {
        expect(layout.ok).toBe(true);
        expect(layout.seats).toHaveLength(n);

        const boxes = layout.seats.map((s) => box(s, size));

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
          expect(b.left).toBeGreaterThanOrEqual(MARGIN - 0.5);
          expect(b.top).toBeGreaterThanOrEqual(MARGIN - 0.5);
          expect(b.right).toBeLessThanOrEqual(container.w - MARGIN + 0.5);
          expect(b.bottom).toBeLessThanOrEqual(container.h - MARGIN + 0.5);
        }
      });
    }
  }

  it('puts my seat (relative 0) at the bottom center and the count-1 seat at the top center', () => {
    const size = SEAT.compact;
    const layout = computeTableLayout({
      width: 1152,
      height: 553,
      n: 10,
      mySeat: 3,
      seatW: size.w,
      seatH: size.h,
      zoneW: ZONE_W,
      zoneH: ZONE_H,
      margin: MARGIN,
    });
    // Absolute seat 3 is "me" -> bottom center.
    expect(layout.seats[3].x).toBeCloseTo(1152 / 2, 0);
    expect(layout.seats[3].y).toBeGreaterThan(553 / 2);
    // Relative seat 5 is opposite "me" -> top center.
    expect(layout.seats[8].x).toBeCloseTo(1152 / 2, 0);
    expect(layout.seats[8].y).toBeLessThan(553 / 2);
  });
});
