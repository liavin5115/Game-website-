/**
 * Dev-only geometry checker for the desktop poker table. It measures the
 * bounding boxes of the reserved center rows (community cards, street pill,
 * pot, message), every seat, every badge slot and the action bar, then reports
 * any pair closer than `minGap` (16px by default) or overlapping at all.
 *
 * It is intentionally dependency-free and only reads the DOM, so it can be
 * called from the browser console during manual verification:
 *   window.__pokerOverlapCheck()
 */

export interface CheckRect {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface OverlapViolation {
  a: string;
  b: string;
  /** Actual separation in px (negative means the boxes overlap). */
  gap: number;
  minGap: number;
}

export interface OverlapReport {
  ok: boolean;
  minGap: number;
  violations: OverlapViolation[];
  rects: CheckRect[];
  /** Selectors that matched nothing, e.g. before the table has mounted. */
  missing: string[];
}

export const SEAT_SELECTOR = '[data-pk-seat]';
export const BADGES_SELECTOR = '[data-pk-badges]';
export const TIMER_SELECTOR = '[data-pk-timer]';
export const CARDS_SELECTOR = '[data-pk-cards]';
export const STACK_SELECTOR = '[data-pk-stack]';
export const CENTER_SELECTOR = '[data-pk-cc],[data-pk-street],[data-pk-pot],[data-pk-message]';
export const ACTIONBAR_SELECTOR = '[data-pk-actionbar]';

function toRect(el: Element): CheckRect | null {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { id: '', left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

/** Separation between two axis-aligned boxes (negative when they overlap). */
export function boxGap(a: CheckRect, b: CheckRect): number {
  const gapX = Math.max(a.left - b.right, b.left - a.right);
  const gapY = Math.max(a.top - b.bottom, b.top - a.bottom);
  return Math.max(gapX, gapY);
}

type PartKind = 'seat' | 'badges' | 'timer' | 'cards' | 'stack' | 'center' | 'actionbar';

interface Labeled extends CheckRect {
  kind: PartKind;
  /** Identifies the seat (or logical region) a box belongs to. */
  owner: string;
  /** True for the seat's outer box, which *contains* its own parts. */
  shell: boolean;
}

export function checkPokerOverlaps(root: Element | null, minGap = 16): OverlapReport {
  const missing: string[] = [];
  if (!root) {
    return { ok: false, minGap, violations: [], rects: [], missing: ['root'] };
  }

  const ownerOf = (el: Element, fallback: string): string => {
    const seat = el.closest('[data-pk-seat]');
    return seat ? `seat${seat.getAttribute('data-pk-seat')}` : fallback;
  };

  const collect = (selector: string, kind: PartKind, shell = false): Labeled[] => {
    const els = Array.from(root.querySelectorAll(selector));
    if (els.length === 0) missing.push(selector);
    const out: Labeled[] = [];
    els.forEach((el, i) => {
      const r = toRect(el);
      if (r) {
        out.push({
          ...r,
          id: els.length > 1 ? `${kind}#${i}` : kind,
          kind,
          owner: ownerOf(el, kind),
          shell,
        });
      }
    });
    return out;
  };

  const doc = root.ownerDocument || document;
  const actionbar = doc.querySelector(ACTIONBAR_SELECTOR);
  const rects: Labeled[] = [
    ...collect(SEAT_SELECTOR, 'seat', true),
    ...collect(BADGES_SELECTOR, 'badges'),
    ...collect(TIMER_SELECTOR, 'timer'),
    ...collect(CARDS_SELECTOR, 'cards'),
    ...collect(STACK_SELECTOR, 'stack'),
    ...collect(CENTER_SELECTOR, 'center'),
  ];
  if (actionbar) {
    const r = toRect(actionbar);
    if (r) rects.push({ ...r, id: 'actionbar', kind: 'actionbar', owner: 'actionbar', shell: false });
  } else {
    missing.push(ACTIONBAR_SELECTOR);
  }

  const violations: OverlapViolation[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const sameOwner = a.owner === b.owner;
      // A seat's outer box contains its own badges/timer/cards/stack, so those
      // pairs are expected to overlap and carry no meaning.
      if (sameOwner && (a.shell || b.shell)) continue;
      const gap = boxGap(a, b);
      // Boxes stacked inside the same seat (or the same center column) only
      // need to not overlap; everything else keeps the full safe gap.
      const required = sameOwner ? 0 : minGap;
      if (gap < required) {
        violations.push({ a: a.id, b: b.id, gap: Math.round(gap * 10) / 10, minGap: required });
      }
    }
  }

  return {
    ok: violations.length === 0 && missing.length === 0,
    minGap,
    violations,
    rects: rects.map(({ id, left, top, right, bottom }) => ({
      id,
      left: Math.round(left),
      top: Math.round(top),
      right: Math.round(right),
      bottom: Math.round(bottom),
    })),
    missing,
  };
}
