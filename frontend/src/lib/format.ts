let warnedAboutMissingAmount = false;

function isMissing(value: unknown): value is null | undefined {
  return value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value);
}

// A single, fixed locale so every surface (navbar, wallet, result panel, table
// stacks, bets, pot, buttons) groups digits the same way: 1,122 not 1.122.
const LOCALE = 'en-US';

/**
 * One formatting path for every points amount in the app.
 * Missing data is never rendered as 0; it is rendered as "-" and warned once.
 */
export function formatPoints(value: number | null | undefined): string {
  if (isMissing(value)) {
    if (!warnedAboutMissingAmount) {
      warnedAboutMissingAmount = true;
      console.warn('[format] Missing points from the server; showing "-" instead of 0.');
    }
    return '-';
  }
  return value.toLocaleString(LOCALE);
}

/** Like formatPoints but always shows an explicit sign: +20, -20, 0. */
export function formatNet(value: number | null | undefined): string {
  if (isMissing(value)) {
    if (!warnedAboutMissingAmount) {
      warnedAboutMissingAmount = true;
      console.warn('[format] Missing points from the server; showing "-" instead of 0.');
    }
    return '-';
  }
  const magnitude = Math.abs(value).toLocaleString(LOCALE);
  if (value > 0) return `+${magnitude}`;
  if (value < 0) return `-${magnitude}`;
  return '0';
}
