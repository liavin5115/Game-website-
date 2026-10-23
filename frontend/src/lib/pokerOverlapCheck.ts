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

interface Labeled extends CheckRect {
  kind: 'seat' | 'badges' | 'center' | 'actionbar';
}

export function checkPokerOverlaps(root: Element | null, minGap = 16): OverlapReport {
  const missing: string[] = [];
  if (!root) {
    return { ok: false, minGap, violations: [], rects: [], missing: ['root'] };
  }

  const collect = (selector: string, kind: Labeled['kind']): Labeled[] => {
    const els = Array.from(root.querySelectorAll(selector));
    if (els.length === 0) missing.push(selector);
    const out: Labeled[] = [];
    els.forEach((el, i) => {
      const r = toRect(el);
      if (r) out.push({ ...r, id: els.length > 1 ? `${kind}#${i}` : kind, kind });
    });
    return out;
  };

  const doc = root.ownerDocument || document;
  const actionbar = doc.querySelector(ACTIONBAR_SELECTOR);
  const rects: Labeled[] = [
    ...collect(SEAT_SELECTOR, 'seat'),
    ...collect(BADGES_SELECTOR, 'badges'),
    ...collect(CENTER_SELECTOR, 'center'),
  ];
  if (actionbar) {
    const r = toRect(actionbar);
    if (r) rects.push({ ...r, id: 'actionbar', kind: 'actionbar' });
  } else {
    missing.push(ACTIONBAR_SELECTOR);
  }

  const violations: OverlapViolation[] = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i];
      const b = rects[j];
      const gap = boxGap(a, b);
      // Badges live inside their own seat, so that pair is expected to overlap.
      const sameSeatPair =
        (a.kind === 'seat' && b.kind === 'badges') || (a.kind === 'badges' && b.kind === 'seat');
      if (sameSeatPair) continue;
      // Center rows are stacked; they only need to not overlap each other.
      const bothCenter = a.kind === 'center' && b.kind === 'center';
      // Two badge slots may sit side by side; require the normal gap.
      const required = bothCenter ? 0 : minGap;
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
