import { describe, expect, it } from 'vitest';
import { relativeSeatIndex, seatLayout, seatPositionsBySeat } from './pokerSeat';

const COUNTS = [2, 3, 6, 10];

describe('poker seat rotation', () => {
  it('puts the player with relativeIndex 0 at the bottom center for every n', () => {
    for (const n of COUNTS) {
      const layout = seatLayout(n);
      expect(layout).toHaveLength(n);
      // Bottom center: same x as the table center, below it, pointing down.
      expect(layout[0].x).toBeCloseTo(50, 5);
      expect(layout[0].y).toBeGreaterThan(50);
      expect(layout[0].angle).toBeCloseTo(90, 5);
    }
  });

  it('places EACH player at the bottom when that player is "me"', () => {
    for (const n of COUNTS) {
      for (let me = 0; me < n; me++) {
        const positions = seatPositionsBySeat(n, me);
        const myPoint = positions[me];
        // My own seat is always relativeIndex 0 -> bottom center.
        expect(relativeSeatIndex(me, me, n)).toBe(0);
        expect(myPoint.x).toBeCloseTo(50, 5);
        expect(myPoint.y).toBeGreaterThan(50);
        expect(myPoint.angle).toBeCloseTo(90, 5);
      }
    }
  });

  it('orders the other seats clockwise using relativeIndex', () => {
    for (const n of COUNTS) {
      for (let me = 0; me < n; me++) {
        // relativeIndex covers every seat exactly once.
        const seen = new Set<number>();
        for (let seat = 0; seat < n; seat++) {
          seen.add(relativeSeatIndex(seat, me, n));
        }
        expect(seen.size).toBe(n);

        // Clockwise = angle increases with relativeIndex.
        const positions = seatPositionsBySeat(n, me);
        let prevAngle = positions[me].angle;
        for (let r = 1; r < n; r++) {
          const seat = (me + r) % n;
          let angle = positions[seat].angle;
          if (angle < prevAngle) angle += 360;
          expect(angle).toBeGreaterThan(prevAngle);
          prevAngle = angle;
        }
      }
    }
  });

  it('uses seat 0 as the reference for a watcher (no seat)', () => {
    for (const n of COUNTS) {
      const layout = seatLayout(n);
      const positions = seatPositionsBySeat(n, 0);
      for (let seat = 0; seat < n; seat++) {
        expect(positions[seat]).toEqual(layout[seat]);
      }
    }
  });
});
