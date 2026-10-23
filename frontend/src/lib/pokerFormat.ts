let warnedAboutMissingAmount = false;

function isMissing(value: unknown): value is null | undefined {
  return value === null || value === undefined || typeof value !== 'number' || !Number.isFinite(value);
}

/**
 * One formatting path for poker amounts.
 * Missing data is never rendered as 0; it is rendered as "-" and warned once.
 */
export function formatPokerAmount(value: number | null | undefined, signed = false): string {
  if (isMissing(value)) {
    if (!warnedAboutMissingAmount) {
      warnedAboutMissingAmount = true;
      console.warn('[poker] Missing amount from the server; showing "-" instead of 0.');
    }
    return '-';
  }
  if (signed && value > 0) return `+${value.toLocaleString()}`;
  if (value < 0) return `-${Math.abs(value).toLocaleString()}`;
  return value.toLocaleString();
}

export function formatPokerNet(value: number | null | undefined): string {
  return formatPokerAmount(value, true);
}

export function formatPokerPoints(value: number | null | undefined): string {
  return `${formatPokerAmount(value)} pts`;
}
