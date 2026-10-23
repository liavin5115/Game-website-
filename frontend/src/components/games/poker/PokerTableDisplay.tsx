/** Presentational poker table component - takes all data as props */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Card } from './Card';
import { Button } from '../../common/Button';
import { Modal } from '../../common/Modal';
import { Input } from '../../common/Input';
import { chipColors } from '../../../design/tokens';
import { formatNet, formatPoints } from '../../../lib/format';
import { computeTableLayout } from '../../../lib/pokerTableLayout';
import { checkPokerOverlaps } from '../../../lib/pokerOverlapCheck';
import type { PokerResult } from '../../../types';

const STREET_LABELS = ['Preflop', 'Flop', 'Turn', 'River', 'Showdown'];
const STREET_PILL_LABELS = [
  'Preflop',
  'Flop - 3rd street',
  'Turn - 4th street',
  'River - 5th street',
  'Showdown',
];

const STATUS_BADGE_STYLES: Record<string, string> = {
  folded: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  allin: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  away: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
  disconnected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  auto_acted: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
};

// Reserved center column sizing (px). The DOM below reuses these exact numbers,
// so the safe-zone math and the rendered boxes always agree.
const ZONE_W = 352; // 5 x 64px cards + 4 x 8px gaps
const ZONE_H = 178; // cards 90 + street 22 + pot 20 + message 28 + 3 x 6 gaps
const SEAT_GAP = 16;
const SEAT_RIM = 6;

/**
 * Fixed desktop seat geometry. My seat is a little larger (md cards) than the
 * opponents' (sm cards). Every row has a reserved height so the seat box never
 * changes size when badges, the hand name or the turn timer appear.
 */
interface SeatMetrics {
  w: number;
  h: number;
  card: 'xs' | 'sm' | 'md';
  gap: number;
  badgesH: number;
  nameH: number;
  cardsH: number;
  stackH: number;
  handH: number;
  statusH: number;
  timerH: number;
  nameClass: string;
}

const SEAT_METRICS: Record<'me' | 'opp', SeatMetrics> = {
  me: {
    w: 152,
    h: 183,
    card: 'md',
    gap: 2,
    badgesH: 18,
    nameH: 16,
    cardsH: 90,
    stackH: 16,
    handH: 10,
    statusH: 16,
    timerH: 5,
    nameClass: 'text-sm max-w-[128px]',
  },
  opp: {
    w: 118,
    h: 148,
    card: 'sm',
    gap: 2,
    badgesH: 18,
    nameH: 16,
    cardsH: 56,
    stackH: 16,
    handH: 10,
    statusH: 16,
    timerH: 4,
    nameClass: 'text-xs max-w-[100px]',
  },
};

function getChipColor(amount: number) {
  if (amount >= 1000) return chipColors.orange;
  if (amount >= 500) return chipColors.purple;
  if (amount >= 100) return chipColors.black;
  if (amount >= 25) return chipColors.green;
  if (amount >= 10) return chipColors.blue;
  if (amount >= 5) return chipColors.red;
  return chipColors.white;
}

function ChipPill({ amount }: { amount: number }) {
  const color = getChipColor(amount);
  return (
    <div
      className="num flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
      style={{
        backgroundColor: `${color.base}20`,
        border: `1px solid ${color.edge}`,
        color: color.text,
      }}
    >
      <span style={{ backgroundColor: color.base, color: color.text }} className="w-3 h-3 rounded-full flex items-center justify-center text-[8px]" />
      {formatPoints(amount)}
    </div>
  );
}

function Badge({ children, className = '', title, compact = false }: { children: React.ReactNode; className?: string; title?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center rounded font-medium ${compact ? 'px-1 py-0 text-[9px] leading-4' : 'px-1.5 py-0.5 text-[10px]'} ${className}`} title={title}>
      {children}
    </span>
  );
}

export interface PokerTableDisplayProps {
  game: any;
  gameState: any;
  players: any[];
  me: any;
  mySeat: number;
  numPlayers: number;
  street: number;
  buttonPos: number;
  sbIdx: number;
  bbIdx: number;
  sbAmount: number;
  bbAmount: number;
  currentTurnIdx: number;
  currentTurnPlayerName?: string;
  turnSeconds: number;
  remaining: number;
  isLowTime: boolean;
  validActions: string[];
  isMyTurn: boolean;
  isActionPending: boolean;
  isConnected: boolean;
  showReconnectBanner: boolean;
  error: string;
  isShowdown: boolean;
  showRules: boolean;
  setShowRules: (v: boolean) => void;
  handleAction: (actionType: string, amount?: number) => void;
  handleFold: () => void;
  openBetModal: (actionType: 'bet' | 'raise', minAmount: number) => void;
  betMin: number;
  raiseMin: number;
  callAmount: number;
  canCheck: boolean;
  // Bet modal
  betMaxAmount: number;
  showBetModal: boolean;
  setShowBetModal: (v: boolean) => void;
  pendingBetAction: 'bet' | 'raise' | null;
  betAmount: number;
  setBetAmount: (v: number) => void;
  confirmBet: () => void;
  // Fold confirm
  showFoldConfirm: boolean;
  setShowFoldConfirm: (v: boolean) => void;
  confirmFold: () => void;
  // Reveal / results
  results: PokerResult[];
  winners: number[];
  winningCards: string[];
  potTotal: number;
  showResult: boolean;
  revealActive: boolean;
  revealRemaining: number;
  onSkipReveal: () => void;
  showdown: boolean;
  // Finished panel
  nextGameId: number | null;
  buyIn: number;
  userPoints: number | undefined;
  onRematch: () => void;
  onBackToLobby: () => void;
  rematchLoading: boolean;
}

function PlayerSeat({
  player,
  isMe,
  isCurrentTurn,
  isDealer,
  isSB,
  isBB,
  status,
  autoActed,
  connected,
  isShowdown,
  result,
  isFinished,
  revealActive,
  revealRemaining,
  showdown,
  winningCards,
  isWinner,
  showTimer,
  remaining,
  turnSeconds,
  compact = false,
  fixedSize = false,
  metrics,
}: {
  player: any;
  isMe: boolean;
  isCurrentTurn: boolean;
  isDealer: boolean;
  isSB: boolean;
  isBB: boolean;
  status: string;
  autoActed: boolean;
  connected: boolean;
  isShowdown: boolean;
  result?: PokerResult;
  isFinished: boolean;
  revealActive: boolean;
  revealRemaining: number;
  showdown: boolean;
  winningCards: string[];
  isWinner: boolean;
  showTimer?: boolean;
  remaining?: number;
  turnSeconds?: number;
  isLowTime?: boolean;
  compact?: boolean;
  /** Desktop: lock the seat to a fixed box so placement math is exact. */
  fixedSize?: boolean;
  /** Desktop fixed-size geometry; required when `fixedSize` is set. */
  metrics?: SeatMetrics;
}) {
  const showCards = isMe || status === 'showdown' || isShowdown;
  const isFolded = status === 'folded';
  const isAllIn = status === 'allin' || status === 'all_in';
  const isAway = status === 'away';
  const fixed = fixedSize && !!metrics;
  // Fixed desktop seats always use the compact badge style so up to three
  // badges (D/SB/BB) fit one fixed-height slot without touching.
  const badgeCompact = fixed ? true : compact;
  const cardSize: 'xs' | 'sm' | 'md' = fixed ? metrics!.card : compact ? 'xs' : 'sm';
  const showNet = revealActive && (revealRemaining <= 2 || !showdown) && result;
  const dimmed = revealActive && !isWinner;

  // Turn timer. Colour buckets match the spec (>10s green, 10-5s amber, <5s red
  // with a soft pulse); the seconds are always rendered as text so colour is
  // never the only signal. The bar lives in its own reserved row at the bottom
  // edge of the seat, never in the badge row.
  const secs = Math.max(0, Math.floor(remaining ?? 0));
  const totalSecs = turnSeconds ?? 30;
  const timerProgress = totalSecs > 0 ? Math.max(0, Math.min(1, (remaining ?? 0) / totalSecs)) : 0;
  const timerFill =
    secs < 5 ? 'bg-red-500 motion-safe:animate-pulse' : secs <= 10 ? 'bg-amber-400' : 'bg-green-500';
  const timerText =
    secs < 5
      ? 'text-red-600 dark:text-red-400'
      : secs <= 10
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-green-600 dark:text-green-400';

  const rowStyle = (h: number) => (fixed ? { height: h } : undefined);

  return (
    <div
      className={`relative flex flex-col items-center rounded-xl transition-[opacity,box-shadow] duration-200 ${
        fixed
          ? 'justify-start px-1'
          : compact
            ? 'min-w-[112px] gap-1'
            : 'min-w-[140px] gap-1.5'
      } ${
        isCurrentTurn && !isFinished ? 'shadow-[0_0_0_2px_rgba(250,204,21,0.95)]' : ''
      } ${isWinner && revealActive ? 'shadow-[0_0_0_3px_rgba(74,222,128,0.95)]' : ''} ${
        dimmed ? 'opacity-40' : ''
      }`}
      style={fixed ? { width: metrics!.w, height: metrics!.h, gap: metrics!.gap } : undefined}
    >
      {/* Top badges row: one fixed slot per seat for D / SB / BB only. The
          turn timer deliberately does NOT live here. */}
      <div
        data-pk-badges
        className={`flex flex-nowrap shrink-0 items-center gap-0.5 w-full justify-center overflow-hidden ${
          fixed ? '' : compact ? 'h-6' : 'min-h-[32px] gap-1'
        }`}
        style={fixed ? rowStyle(metrics!.badgesH) : undefined}
      >
        {isDealer && (
          <Badge compact={badgeCompact} className="bg-white text-gray-900 border border-gray-300 dark:bg-gray-800 dark:text-white dark:border-gray-600" title="Dealer">
            D
          </Badge>
        )}
        {isSB && <Badge compact={badgeCompact} className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" title="Small Blind">SB</Badge>}
        {isBB && <Badge compact={badgeCompact} className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" title="Big Blind">BB</Badge>}
      </div>

      {/* Name and (You) */}
      <div
        className={`flex w-full shrink-0 items-center justify-center gap-1 overflow-hidden text-center ${fixed ? 'leading-4' : ''}`}
        style={fixed ? rowStyle(metrics!.nameH) : undefined}
      >
        <span
          className={`font-medium text-gray-900 dark:text-white truncate ${
            fixed ? metrics!.nameClass : compact ? 'text-xs max-w-[86px]' : 'text-sm max-w-[120px]'
          }`}
        >
          {player.username}
        </span>
        {isMe && (
          <Badge compact={badgeCompact} className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex-shrink-0">
            You
          </Badge>
        )}
      </div>

      {/* Cards */}
      <div
        data-pk-cards
        className={`flex shrink-0 gap-0.5 items-center justify-center ${
          fixed ? '' : compact ? 'min-h-[40px]' : 'min-h-[56px]'
        }`}
        style={fixed ? rowStyle(metrics!.cardsH) : undefined}
      >
        {isFolded && !isShowdown ? (
          <div className="flex gap-0.5 opacity-40">
            <Card card="??" faceDown size={cardSize} />
            <Card card="??" faceDown size={cardSize} />
          </div>
        ) : (
          (player.cards || []).map((card: string, i: number) => (
            <Card
              key={i}
              card={showCards && card !== '??' ? card : '??'}
              faceDown={!showCards || card === '??'}
              size={cardSize}
              className={
                isShowdown && !isFolded && winningCards.includes(card)
                  ? 'poker-card-flip ring-2 ring-green-400 shadow-[0_0_12px_rgba(74,222,128,0.7)]'
                  : isShowdown && !isFolded
                    ? 'poker-card-flip'
                    : ''
              }
            />
          ))
        )}
      </div>

      {/* Stack and current bet on one line: no separate pill to overlap or
          add height. The bet stays visible as a secondary value. After the
          hand is settled the stack is what the player actually received. */}
      <div
        data-pk-stack
        className={`num flex shrink-0 items-baseline justify-center gap-1 overflow-hidden font-semibold text-gray-900 dark:text-white ${
          fixed ? 'w-full text-xs' : compact ? 'text-[11px]' : 'text-xs'
        }`}
        style={fixed ? rowStyle(metrics!.stackH) : undefined}
      >
        <span>{formatPoints(isFinished && result ? result.payout : player.chips)}</span>
        {player.bet > 0 && (
          <span className="text-yellow-600 dark:text-yellow-400 font-normal">Â· {formatPoints(player.bet)}</span>
        )}
      </div>

      {/* Hand name: its own reserved line so the seat height never changes. */}
      {fixed || (isFinished && showdown && (result?.hand_description || result?.hand_name)) ? (
        <div
          className={`flex w-full shrink-0 items-center justify-center overflow-hidden text-center font-medium leading-none text-green-700 dark:text-green-300 ${
            fixed ? 'text-[10px]' : compact ? 'text-[9px]' : 'text-[10px]'
          }`}
          style={fixed ? rowStyle(metrics!.handH) : undefined}
        >
          <span className="truncate">
            {isFinished && showdown ? result?.hand_description || result?.hand_name : ''}
          </span>
        </div>
      ) : null}

      {/* One reserved status slot: net badge during the reveal, otherwise the
          folded/all-in/turn badges plus the timer seconds at the right end of
          the "Your Turn" line. Nothing else can push this row around. */}
      <div
        className={`relative flex w-full shrink-0 flex-nowrap items-center justify-center gap-0.5 overflow-hidden ${
          fixed ? '' : ''
        }`}
        style={fixed ? rowStyle(metrics!.statusH) : undefined}
      >
        {showNet ? (
          <span
            className={`num rounded-full px-2 py-0.5 text-[11px] font-bold ${
              Number(result?.net) > 0
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : Number(result?.net) < 0
                  ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                  : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
            }`}
          >
            {formatNet(result?.net)}
          </span>
        ) : (
          <>
            {isFolded && <Badge compact={badgeCompact} className={STATUS_BADGE_STYLES.folded}>Folded</Badge>}
            {isAllIn && <Badge compact={badgeCompact} className={STATUS_BADGE_STYLES.allin}>All-in</Badge>}
            {!connected && !isMe && <Badge compact={badgeCompact} className={STATUS_BADGE_STYLES.disconnected}>Disconnected</Badge>}
            {isAway && (connected || !compact) && <Badge compact={badgeCompact} className={STATUS_BADGE_STYLES.away}>Away</Badge>}
            {autoActed && !isAway && <Badge compact={badgeCompact} className={STATUS_BADGE_STYLES.auto_acted}>Auto-acted</Badge>}
            {isCurrentTurn && !isFinished && !isFolded && !isAllIn && !isAway && (
              <Badge compact={badgeCompact} className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 animate-pulse">Your Turn</Badge>
            )}
          </>
        )}
        {fixed && showTimer && (
          <span className={`num pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums ${timerText}`}>
            {secs}s
          </span>
        )}
      </div>

      {/* Reserved timer slot: a thin full-width progress bar pinned to the
          bottom edge of the seat. It occupies space even when it is nobody's
          turn (empty track), so the seat never shifts when the turn starts. */}
      {fixed && (
        <div
          data-pk-timer
          className="relative w-full shrink-0 overflow-hidden rounded-full bg-black/10 dark:bg-white/15"
          style={rowStyle(metrics!.timerH)}
          role="progressbar"
          aria-hidden={!showTimer}
          aria-valuenow={showTimer ? secs : undefined}
          aria-valuemin={0}
          aria-valuemax={totalSecs}
        >
          {showTimer && (
            <div
              className={`h-full rounded-full transition-[width,background-color] duration-250 ease-linear ${timerFill}`}
              style={{ width: `${Math.round(timerProgress * 100)}%` }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CommunityCards({
  cards,
  street,
  highlightCards = [],
  dimNonWinning = false,
  showLabel = false,
}: {
  cards: string[];
  street: number;
  highlightCards?: string[];
  dimNonWinning?: boolean;
  showLabel?: boolean;
}) {
  return (
    <div className="flex justify-center gap-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="relative">
          {i < cards.length ? (
            <Card
              card={cards[i]}
              size="md"
              className={
                highlightCards.includes(cards[i])
                  ? 'ring-2 ring-green-400 shadow-[0_0_12px_rgba(74,222,128,0.7)]'
                  : dimNonWinning
                    ? 'opacity-50'
                    : ''
              }
            />
          ) : (
            <div
              className="w-16 rounded-lg border-2 border-dashed border-gray-300/70 dark:border-gray-600/70 bg-gradient-to-br from-gray-50/50 to-gray-100/50 dark:from-gray-800/50 dark:to-gray-700/50"
              style={{ aspectRatio: '5/7' }}
              aria-label={`Community card slot ${i + 1}`}
            />
          )}
        </div>
      ))}
      {showLabel && (
        <div className="w-full text-center mt-2 text-sm text-gray-500 dark:text-gray-400">
          {STREET_LABELS[street] || `Street ${street}`}
        </div>
      )}
    </div>
  );
}

function StreetPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/25 bg-black/35 px-3 py-[2px] text-[11px] font-semibold uppercase tracking-wider text-white/90 shadow-sm">
      {label}
    </span>
  );
}

function CenterInfo({
  pot,
  sbAmount,
  bbAmount,
  currentTurnPlayerName,
  phase,
  myValidActions,
  isMyTurn,
  revealActive,
  revealRemaining,
  showdown,
  onSkipReveal,
}: {
  pot: number;
  sbAmount: number;
  bbAmount: number;
  currentTurnPlayerName?: string;
  phase: string;
  myValidActions: string[];
  isMyTurn: boolean;
  revealActive: boolean;
  revealRemaining: number;
  showdown: boolean;
  onSkipReveal: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <span>Blinds: {sbAmount}/{bbAmount}</span>
        <span className="text-yellow-600 dark:text-yellow-400 font-bold">Pot: {formatPoints(pot)}</span>
      </div>

      {revealActive && (
        <div
          aria-live="polite"
          className="flex items-center gap-3 rounded-full border border-gold-500/50 bg-black/40 px-3 py-1 text-xs font-medium text-white shadow-lg"
        >
          <span>
            {showdown
              ? `Showing result in ${Math.max(1, revealRemaining)}`
              : 'Hand complete'}
          </span>
          <button
            type="button"
            onClick={onSkipReveal}
            className="rounded-full bg-gold-500 px-2 py-0.5 text-[11px] font-bold text-felt-950 hover:bg-gold-400"
          >
            Skip
          </button>
        </div>
      )}
      {phase === 'in_progress' && currentTurnPlayerName && !isMyTurn && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Waiting for <span className="font-medium text-gray-900 dark:text-white">{currentTurnPlayerName}</span>...
        </p>
      )}
      {phase === 'in_progress' && isMyTurn && myValidActions.length > 0 && (
        <p className="text-sm text-green-600 dark:text-green-400 font-medium">
          Your turn - {myValidActions.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ')}
        </p>
      )}
      {phase === 'finished' && (
        <p className="text-sm text-gray-500 dark:text-gray-400">Hand complete</p>
      )}
    </div>
  );
}

function TimerRing({
  remaining,
  totalSeconds,
  isLowTime,
  className = '',
  size = 'md',
}: {
  remaining: number;
  totalSeconds: number;
  isLowTime: boolean;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? Math.max(0, Math.min(1, remaining / totalSeconds)) : 0;
  const strokeDashoffset = circumference * (1 - progress);
  const box = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-[8px]' : 'text-[10px]';

  return (
    <div className={`relative ${box} flex items-center justify-center ${className}`}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 64 64">
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={`transition-all duration-250 ease-linear ${isLowTime ? 'text-red-500' : 'text-yellow-500'}`}
          style={{ filter: 'dropShadow(0 2px 4px rgba(0,0,0,0.2))' }}
        />
      </svg>
      <span className={`num absolute text-center font-bold ${textSize} ${isLowTime ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
        {remaining}s
      </span>
    </div>
  );
}

function ConnectionBanner({ showReconnectBanner, isConnected }: { showReconnectBanner: boolean; isConnected: boolean }) {
  if (showReconnectBanner) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-orange-600 text-white rounded-lg shadow-lg text-sm font-medium animate-pulse">
        Reconnecting...
      </div>
    );
  }
  if (!isConnected) {
    return (
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-green-600 text-white rounded-lg shadow-lg text-sm font-medium">
        Back online
      </div>
    );
  }
  return null;
}

function RulesPanel({ onClose }: { onClose: () => void }) {
  return (
    <Modal isOpen={true} onClose={onClose} title="Poker Rules" size="lg">
      <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
        <div>
          <h4 className="font-semibold mb-2">Blinds & Buy-in</h4>
          <ul className="list-disc list-inside space-y-1">
            <li>Big Blind = buy-in Ã· 20 (minimum 1)</li>
            <li>Small Blind = Big Blind Ã· 2 (minimum 1)</li>
            <li>Minimum buy-in: 40 points</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Betting</h4>
          <ul className="list-disc list-inside space-y-1">
            <li>No rake</li>
            <li>Minimum raise = Big Blind</li>
            <li>Short raise (less than min raise) = All-in</li>
            <li>Cannot bet more than your stack</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Turn Timer</h4>
          <ul className="list-disc list-inside space-y-1">
            <li>30 seconds per turn</li>
            <li>Timeout = Check if allowed, otherwise Fold</li>
            <li>2 timeouts in a row = "Away" (auto check/fold instantly)</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Showdown & Settlement</h4>
          <ul className="list-disc list-inside space-y-1">
            <li>Best 5 of 7 cards wins</li>
            <li>Split pots: odd chip to first winner clockwise from button</li>
            <li>Leftover chips (unbet) refunded to your wallet</li>
            <li>Folded players' cards stay hidden forever</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Disconnects</h4>
          <ul className="list-disc list-inside space-y-1">
            <li>Game continues if you disconnect</li>
            <li>Timer runs, auto-check/fold on timeout</li>
            <li>{'All players disconnected > 2 min: hand plays to showdown, then settles'}</li>
          </ul>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Rematch</h4>
          <ul className="list-disc list-inside space-y-1">
            <li>"Play Again" creates/joins a new game with same players</li>
            <li>Only original players can rematch</li>
            <li>Requires sufficient balance for buy-in</li>
          </ul>
        </div>
      </div>
    </Modal>
  );
}

function BetRaiseModal({
  isOpen,
  onClose,
  actionType,
  amount,
  setAmount,
  minAmount,
  maxAmount,
  pot,
  onConfirm,
  disabled,
}: {
  isOpen: boolean;
  onClose: () => void;
  actionType: 'bet' | 'raise';
  amount: number;
  setAmount: (v: number) => void;
  minAmount: number;
  maxAmount: number;
  pot: number;
  onConfirm: () => void;
  disabled: boolean;
}) {
  const safeMin = Math.max(0, Math.ceil(Number(minAmount) || 0));
  const safeMax = Math.max(0, Math.floor(Number(maxAmount) || 0));
  const hasRange = safeMax > 0 && safeMax >= safeMin;
  const clampedAmount = hasRange
    ? Math.max(safeMin, Math.min(safeMax, Math.trunc(Number(amount) || 0)))
    : safeMin;
  const confirmDisabled = disabled || !hasRange;
  const halfPot = Math.floor(pot / 2);
  const isRaise = actionType === 'raise';
  const label = isRaise ? 'Raise to' : 'Bet';

  const quickButtons = [
    { label: 'Min', value: safeMin, disabled: !hasRange },
    { label: 'Half Pot', value: Math.max(safeMin, Math.min(safeMax, halfPot)), disabled: !hasRange },
    { label: 'Pot', value: Math.max(safeMin, Math.min(safeMax, pot)), disabled: !hasRange },
    { label: 'All-in', value: safeMax, disabled: !hasRange },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${label} Amount`} size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label} (min {formatPoints(safeMin)}, max {formatPoints(safeMax)})
          </label>
          {!hasRange && (
            <p className="mb-2 text-sm text-red-600 dark:text-red-400">
              No legal {actionType} amount for your stack. Call, check, or fold instead.
            </p>
          )}
          <div className="relative">
            <input
              type="range"
              min={safeMin}
              max={hasRange ? safeMax : safeMin}
              step={1}
              value={clampedAmount}
              onChange={(e) => setAmount(Math.trunc(Number(e.target.value)))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
              disabled={disabled || !hasRange}
            />
            <div className="absolute bottom-full left-0 right-0 flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>{formatPoints(safeMin)}</span>
              <span>{formatPoints(safeMax)}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              type="number"
              value={clampedAmount}
              onChange={(e) => setAmount(Math.max(safeMin, Math.min(safeMax, Math.trunc(Number(e.target.value) || 0))))}
              min={safeMin}
              max={safeMax}
              className="w-32"
              disabled={disabled || !hasRange}
            />
            <span className="text-sm text-gray-500 dark:text-gray-400">Total bet</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {quickButtons.map((btn) => (
            <Button
              key={btn.label}
              variant="secondary"
              size="sm"
              onClick={() => setAmount(Math.trunc(btn.value))}
              disabled={disabled || !hasRange || btn.value === clampedAmount}
            >
              {btn.label}
            </Button>
          ))}
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={disabled}>
            Cancel
          </Button>
          <Button onClick={onConfirm} loading={disabled} className="flex-1" disabled={confirmDisabled}>
            {label} {formatPoints(clampedAmount)}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function FoldConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  disabled,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Fold" size="sm">
      <div className="space-y-4">
        <p className="text-gray-700 dark:text-gray-300">
          Check is available. Folding now will forfeit the hand for free.
          Are you sure you want to fold?
        </p>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={disabled}>
            Keep Playing
          </Button>
          <Button variant="danger" onClick={onConfirm} className="flex-1" disabled={disabled}>
            Fold Anyway
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const RESULT_BADGES: Record<string, { label: string; className: string }> = {
  won: { label: 'Winner', className: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  split: { label: 'Split', className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300' },
  folded: { label: 'Folded', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  lost: { label: 'Lost', className: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
};

function FinishedPanel({
  results,
  meId,
  potTotal,
  showdown,
  winningCards,
  nextGameId,
  buyIn,
  userPoints,
  onRematch,
  onBackToLobby,
  rematchLoading,
}: {
  results: PokerResult[];
  meId?: number;
  potTotal: number;
  showdown: boolean;
  winningCards: string[];
  nextGameId: number | null;
  buyIn: number;
  userPoints: number | undefined;
  onRematch: () => void;
  onBackToLobby: () => void;
  rematchLoading: boolean;
}) {
  const mine = results.find((r) => r.id === meId);
  const myNet = mine?.net;
  const header = (() => {
    switch (mine?.result) {
      case 'won':
        return { text: `You won ${formatPoints(Math.abs(myNet ?? 0))} pts`, className: 'text-green-600 dark:text-green-400' };
      case 'split':
        return { text: `Split pot ${formatPoints(Math.abs(myNet ?? 0))} pts`, className: 'text-yellow-600 dark:text-yellow-400' };
      case 'folded':
        return { text: `You folded ${formatPoints(Math.abs(myNet ?? 0))} pts`, className: 'text-gray-600 dark:text-gray-300' };
      case 'lost':
        return { text: `You lost ${formatPoints(Math.abs(myNet ?? 0))} pts`, className: 'text-red-600 dark:text-red-400' };
      default:
        return { text: 'Hand result', className: 'text-gray-900 dark:text-white' };
    }
  })();
  const canAfford = (userPoints ?? 0) >= buyIn;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-5 border dark:border-gray-700 animate-slide-up">
      <h3 className={`text-xl font-bold text-center mb-1 ${header.className}`}>{header.text}</h3>
      <p className="text-center text-xs text-gray-500 dark:text-gray-400 mb-4">
        {showdown ? 'Showdown' : 'Uncontested pot'} Â· Pot {formatPoints(potTotal)}
      </p>

      <div className="grid gap-2 mb-4">
        {results.map((r) => {
          const badge = RESULT_BADGES[r.result] || RESULT_BADGES.lost;
          const isMe = r.id === meId;
          return (
            <div
              key={r.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${
                r.result === 'won' || r.result === 'split'
                  ? 'border-green-300 bg-green-50 dark:border-green-700 dark:bg-green-900/20'
                  : 'border-gray-200 bg-gray-50 dark:border-gray-600 dark:bg-gray-700/50'
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium text-gray-900 dark:text-white">{r.username}</span>
                {isMe && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    You
                  </span>
                )}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.className}`}>{badge.label}</span>
                {r.revealed_cards?.length > 0 && (
                  <span className="flex gap-0.5">
                    {r.revealed_cards.map((card, i) => (
                      <Card
                        key={i}
                        card={card}
                        size="xs"
                        className={winningCards.includes(card) ? 'ring-1 ring-green-400' : ''}
                      />
                    ))}
                  </span>
                )}
                {(r.hand_description || r.hand_name) && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">{r.hand_description || r.hand_name}</span>
                )}
              </div>
              <div className="flex items-center gap-4 text-right">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Payout <span className="num text-gray-900 dark:text-white">{formatPoints(r.payout)}</span>
                </span>
                <span
                  className={`num font-bold ${
                    r.net > 0 ? 'text-green-600 dark:text-green-400' : r.net < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-500'
                  }`}
                >
                  {formatNet(r.net)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col items-center justify-center gap-1 text-sm text-gray-600 dark:text-gray-300 sm:flex-row sm:gap-6">
        <span>Pot total: <span className="num font-semibold text-gray-900 dark:text-white">{formatPoints(potTotal)}</span></span>
        <span>Balance: <span className="num font-semibold text-gray-900 dark:text-white">{formatPoints(userPoints)} pts</span></span>
      </div>

      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
        <Button
          onClick={onRematch}
          loading={rematchLoading}
          disabled={rematchLoading || !canAfford}
          className="min-w-[180px]"
        >
          {nextGameId ? 'Join Rematch' : `Play Again (${formatPoints(buyIn)} pts)`}
        </Button>
        {!canAfford && (
          <span className="text-center text-sm text-red-600 dark:text-red-400 sm:text-left">
            Insufficient balance ({formatPoints(userPoints)} pts, need {formatPoints(buyIn)} pts)
          </span>
        )}
        <Button onClick={onBackToLobby} variant="secondary" size="lg">
          Back to Lobby
        </Button>
      </div>
    </div>
  );
}

function ActionBar({
  validActions,
  isMyTurn,
  isActionPending,
  isConnected,
  remaining,
  callAmount,
  canCheck,
  handleFold,
  openBetModal,
  betMin,
  raiseMin,
  handleAction,
  isFinished,
}: {
  validActions: string[];
  isMyTurn: boolean;
  isActionPending: boolean;
  isConnected: boolean;
  remaining: number;
  callAmount: number;
  canCheck: boolean;
  handleFold: () => void;
  openBetModal: (actionType: 'bet' | 'raise', minAmount: number) => void;
  betMin: number;
  raiseMin: number;
  handleAction: (actionType: string, amount?: number) => void;
  isFinished: boolean;
}) {
  const disabled = !isMyTurn || isActionPending || remaining <= 0 || !isConnected;

  if (isFinished) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700 text-center">
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Hand finished</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700 sticky bottom-0 z-20 md:static">
      {isMyTurn && validActions.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {validActions.includes('fold') && (
            <Button
              variant="danger"
              size="sm"
              onClick={handleFold}
              disabled={disabled}
              className="min-w-[100px]"
            >
              Fold
            </Button>
          )}
          {canCheck && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleAction('check')}
              disabled={disabled}
              className="min-w-[100px]"
            >
              Check
            </Button>
          )}
          {validActions.includes('call') && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleAction('call', callAmount)}
              disabled={disabled}
              className="min-w-[120px]"
            >
              Call {formatPoints(callAmount)}
            </Button>
          )}
          {validActions.includes('bet') && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => openBetModal('bet', betMin)}
              disabled={disabled}
              className="min-w-[100px]"
            >
              Bet
            </Button>
          )}
          {validActions.includes('raise') && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => openBetModal('raise', raiseMin)}
              disabled={disabled}
              className="min-w-[100px]"
            >
              Raise
            </Button>
          )}
        </div>
      )}

      {!isMyTurn && (
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-2">
          Not your turn
        </p>
      )}
    </div>
  );
}

export function PokerTableDisplay({
  game,
  gameState,
  players,
  me,
  mySeat,
  numPlayers,
  street,
  buttonPos,
  sbIdx,
  bbIdx,
  sbAmount,
  bbAmount,
  currentTurnIdx,
  currentTurnPlayerName,
  turnSeconds,
  remaining,
  isLowTime,
  validActions,
  isMyTurn,
  isActionPending,
  isConnected,
  showReconnectBanner,
  error,
  isShowdown,
  showRules,
  setShowRules,
  handleAction,
  handleFold,
  openBetModal,
  betMin,
  raiseMin,
  callAmount,
  canCheck,
  betMaxAmount,
  showBetModal,
  setShowBetModal,
  pendingBetAction,
  betAmount,
  setBetAmount,
  confirmBet,
  showFoldConfirm,
  setShowFoldConfirm,
  confirmFold,
  results,
  winners,
  winningCards,
  potTotal,
  showResult,
  revealActive,
  revealRemaining,
  onSkipReveal,
  showdown,
  nextGameId,
  buyIn,
  userPoints,
  onRematch,
  onBackToLobby,
  rematchLoading,
}: PokerTableDisplayProps) {
  const tableRef = useRef<HTMLDivElement>(null);
  const [tableSize, setTableSize] = useState({ w: 0, h: 0 });

  // Measure the table so seats can be placed in pixels against the real box.
  useLayoutEffect(() => {
    const el = tableRef.current;
    if (!el) return;
    const measure = () =>
      setTableSize((s) =>
        s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight },
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Dev-only geometry checker, callable from the console as
  // window.__pokerOverlapCheck() during manual verification.
  useEffect(() => {
    const isDev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
    if (!isDev) return;
    (window as unknown as Record<string, unknown>).__pokerOverlapCheck = () =>
      checkPokerOverlaps(tableRef.current);
    return () => {
      delete (window as unknown as Record<string, unknown>).__pokerOverlapCheck;
    };
  }, []);

  const pot = gameState?.pot ?? 0;
  const isFinished = game?.status === 'finished';
  // Keep the settled pot visible through the reveal; only clear it when the
  // result panel actually shows (the pot has been paid to the winner).
  const centerPot = isFinished ? (showResult ? 0 : potTotal) : pot;

  // My seat is deliberately larger (md cards) than the opponents' (sm cards).
  const layout = useMemo(
    () =>
      computeTableLayout({
        width: tableSize.w || 1152,
        height: tableSize.h || 600,
        n: numPlayers,
        mySeat,
        seatW: SEAT_METRICS.opp.w,
        seatH: SEAT_METRICS.opp.h,
        mySeatW: SEAT_METRICS.me.w,
        mySeatH: SEAT_METRICS.me.h,
        zoneW: ZONE_W,
        zoneH: ZONE_H,
        margin: SEAT_GAP,
        rimMargin: SEAT_RIM,
      }),
    [tableSize.w, tableSize.h, numPlayers, mySeat],
  );

  const pillLabel = STREET_PILL_LABELS[street] || `Street ${street}`;
  const turnActions = validActions
    .map((a) => a.charAt(0).toUpperCase() + a.slice(1))
    .join(', ');

  // The message row shows exactly ONE message at a time. The reveal banner
  // replaces the status text; "Hand complete" never stacks on top of it.
  let message: React.ReactNode = null;
  if (revealActive) {
    message = showdown ? (
      <div
        aria-live="polite"
        className="flex min-w-0 max-w-full items-center gap-2 whitespace-nowrap rounded-full border border-gold-500/50 bg-black/45 px-3 py-0.5 text-xs font-medium text-white shadow-lg"
      >
        <span className="truncate">Showing result in {Math.max(1, revealRemaining)}</span>
        <button
          type="button"
          onClick={onSkipReveal}
          className="shrink-0 rounded-full bg-gold-500 px-2 py-[1px] text-[11px] font-bold text-felt-950 hover:bg-gold-400"
        >
          Skip
        </button>
      </div>
    ) : (
      <span className="min-w-0 max-w-full truncate text-sm font-medium text-white/85">Hand complete</span>
    );
  } else if (isFinished) {
    message = <span className="min-w-0 max-w-full truncate text-sm font-medium text-white/85">Hand complete</span>;
  } else if (isMyTurn && validActions.length > 0) {
    message = (
      <span className="min-w-0 max-w-full truncate text-sm font-medium text-green-300">
        Your turn - {turnActions}
      </span>
    );
  } else if (currentTurnPlayerName) {
    message = (
      <span className="min-w-0 max-w-full truncate text-sm text-white/75">
        Waiting for <span className="font-medium text-white">{currentTurnPlayerName}</span>...
      </span>
    );
  }
  const resultsById = useMemo(() => {
    const map: Record<number, PokerResult> = {};
    for (const r of results || []) map[r.id] = r;
    return map;
  }, [results]);
  const winnerSet = useMemo(() => new Set(winners || []), [winners]);

  return (
    <div className="relative min-h-[calc(100vh-8rem)] bg-felt-500/10 dark:bg-felt-900/10 px-4 py-6">
      <ConnectionBanner showReconnectBanner={showReconnectBanner} isConnected={isConnected} />

      {/* Rules panel trigger */}
      <div className="max-w-6xl mx-auto mb-4 flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowRules(!showRules)}
        >
          {showRules ? 'Hide' : 'Show'} Rules
        </Button>
      </div>

      {/* Rules Panel */}
      {showRules && <RulesPanel onClose={() => setShowRules(false)} />}

      {/* Desktop: Oval Table Layout */}
      <div className="hidden md:block relative">
        <div
          ref={tableRef}
          className="w-full max-w-6xl mx-auto relative"
          style={{ height: 'min(72vh, 640px)', minHeight: 600 }}
        >
          {/* Felt table background */}
          <div className="absolute inset-0 rounded-[50%] bg-gradient-to-br from-felt-700 via-felt-600 to-felt-800 border-4 border-felt-900 shadow-2xl overflow-hidden">
            <div className="absolute inset-0 opacity-5" style={{
              backgroundImage: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.3) 100%)',
            }} />
          </div>

          {/* Reserved center column: fixed order, fixed heights, one message. */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none"
            style={{ width: ZONE_W }}
          >
            <div className="flex flex-col items-center gap-[6px]">
              <div data-pk-cc className="flex items-center justify-center" style={{ height: 90 }}>
                <CommunityCards
                  cards={gameState.community_cards || []}
                  street={street}
                  highlightCards={winningCards}
                  dimNonWinning={revealActive && showdown}
                />
              </div>
              <div data-pk-street className="flex items-center justify-center" style={{ height: 22 }}>
                <StreetPill label={pillLabel} />
              </div>
              <div
                data-pk-pot
                className="flex items-center justify-center gap-4 text-xs"
                style={{ height: 20 }}
              >
                <span className="text-white/70">Blinds: {sbAmount}/{bbAmount}</span>
                <span className="num font-bold text-yellow-300">Pot: {formatPoints(centerPot)}</span>
              </div>
              <div
                data-pk-message
                className="pointer-events-auto flex w-full items-center justify-center overflow-hidden px-1"
                style={{ height: 28 }}
              >
                {message}
              </div>
            </div>
          </div>

          {/* Seats: pushed outside the reserved zone by computeTableLayout. */}
          {players.map((player, idx) => {
            const pos = layout.seats[idx] || { x: 0, y: 0 };
            const isCurrent = idx === currentTurnIdx;
            const isDealer = idx === buttonPos;
            const isSB = idx === sbIdx;
            const isBB = idx === bbIdx;
            const playerStatus = player.status;
            const autoActed = player.auto_stood === true;
            const connected = player.connected !== false;

            return (
              <div
                key={player.id}
                data-pk-seat={idx}
                className="absolute pointer-events-auto z-10"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: player.id === me?.id ? SEAT_METRICS.me.w : SEAT_METRICS.opp.w,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <PlayerSeat
                  player={player}
                  isMe={player.id === me?.id}
                  isCurrentTurn={isCurrent}
                  isDealer={isDealer}
                  isSB={isSB}
                  isBB={isBB}
                  status={playerStatus}
                  autoActed={autoActed}
                  connected={connected}
                  isShowdown={isShowdown}
                  result={resultsById[player.id]}
                  isFinished={isFinished}
                  revealActive={revealActive}
                  revealRemaining={revealRemaining}
                  showdown={showdown}
                  winningCards={winningCards}
                  isWinner={winnerSet.has(player.id)}
                  showTimer={isCurrent && game.status === 'in_progress'}
                  remaining={remaining}
                  turnSeconds={turnSeconds}
                  isLowTime={isLowTime}
                  metrics={player.id === me?.id ? SEAT_METRICS.me : SEAT_METRICS.opp}
                  fixedSize
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: Stacked Layout */}
      <div className="md:hidden space-y-4 pb-24">
        {/* Community cards & pot at top */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700">
          <CommunityCards
            cards={gameState.community_cards || []}
            street={street}
            highlightCards={winningCards}
            dimNonWinning={revealActive && showdown}
            showLabel
          />
          <CenterInfo
            pot={centerPot}
            sbAmount={sbAmount}
            bbAmount={bbAmount}
            currentTurnPlayerName={currentTurnPlayerName}
            phase={game.status}
            myValidActions={validActions}
            isMyTurn={isMyTurn}
            revealActive={revealActive}
            revealRemaining={revealRemaining}
            showdown={showdown}
            onSkipReveal={onSkipReveal}
          />
          {game.status === 'in_progress' && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <TimerRing remaining={remaining} totalSeconds={turnSeconds} isLowTime={isLowTime} />
              <div className={`num text-sm font-bold ${isLowTime ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                {remaining}s
              </div>
            </div>
          )}
        </div>

        {/* Other players as 2-column grid */}
        {players.filter(p => p.id !== me?.id).length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">Opponents</h3>
            <div className="grid grid-cols-2 gap-3">
              {players
                .filter(p => p.id !== me?.id)
                .map((player) => {
                  const actualIdx = players.findIndex(p => p.id === player.id);
                  const isCurrent = actualIdx === currentTurnIdx;
                  const isDealer = actualIdx === buttonPos;
                  const isSB = actualIdx === sbIdx;
                  const isBB = actualIdx === bbIdx;
                  const autoActed = player.auto_stood === true;
                  const connected = player.connected !== false;

                  return (
                    <div
                      key={player.id}
                      className={`p-3 rounded-lg border ${isCurrent ? 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/10' : 'border-gray-200 dark:border-gray-700'}`}
                    >
                      <PlayerSeat
                        player={player}
                        isMe={false}
                        isCurrentTurn={isCurrent}
                        isDealer={isDealer}
                        isSB={isSB}
                        isBB={isBB}
                        status={player.status}
                        autoActed={autoActed}
                        connected={connected}
                        isShowdown={isShowdown}
                        result={resultsById[player.id]}
                        isFinished={isFinished}
                        revealActive={revealActive}
                        revealRemaining={revealRemaining}
                        showdown={showdown}
                        winningCards={winningCards}
                        isWinner={winnerSet.has(player.id)}
                      />
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* My panel fixed at bottom */}
        {me && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700 sticky bottom-4 z-20">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900 dark:text-white">{me.username}</span>
                <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">You</Badge>
              </div>
              <div className="text-right">
                <div className="num text-xs font-semibold text-gray-900 dark:text-white">{formatPoints(me.chips)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">Stack</div>
              </div>
            </div>

            <div className="flex justify-center gap-2 mb-3 min-h-[56px] items-end">
              {me.cards.map((card: string, i: number) => (
                <Card key={i} card={card} size="md" />
              ))}
            </div>

            {me.bet > 0 && (
              <div className="flex justify-center mb-3">
                <ChipPill amount={me.bet} />
              </div>
            )}

            <ActionBar
              validActions={validActions}
              isMyTurn={isMyTurn}
              isActionPending={isActionPending}
              isConnected={isConnected}
              remaining={remaining}
              callAmount={callAmount}
              canCheck={canCheck}
              handleFold={handleFold}
              openBetModal={openBetModal}
              betMin={betMin}
              raiseMin={raiseMin}
              handleAction={handleAction}
              isFinished={isFinished}
            />

            {me.status === 'folded' && (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-2">You folded</p>
            )}
          </div>
        )}
      </div>

      {/* Desktop Action Bar: inline right below the table so it can never
          cover the bottom seat. */}
      <div
        data-pk-actionbar
        className="md:block hidden relative max-w-6xl mx-auto mt-4 z-20"
      >
        <ActionBar
          validActions={validActions}
          isMyTurn={isMyTurn}
          isActionPending={isActionPending}
          isConnected={isConnected}
          remaining={remaining}
          callAmount={callAmount}
          canCheck={canCheck}
          handleFold={handleFold}
          openBetModal={openBetModal}
          betMin={betMin}
          raiseMin={raiseMin}
          handleAction={handleAction}
          isFinished={isFinished}
        />
      </div>

      {/* Result panel: inline below the table so the board stays visible */}
      {isFinished && showResult && (
        <div className="max-w-4xl mx-auto mt-6">
          <FinishedPanel
            results={results}
            meId={me?.id}
            potTotal={potTotal}
            showdown={showdown}
            winningCards={winningCards}
            nextGameId={nextGameId}
            buyIn={buyIn}
            userPoints={userPoints}
            onRematch={onRematch}
            onBackToLobby={onBackToLobby}
            rematchLoading={rematchLoading}
          />
        </div>
      )}

      {/* Bet/Raise Modal */}
      <BetRaiseModal
        isOpen={showBetModal}
        onClose={() => setShowBetModal(false)}
        actionType={pendingBetAction!}
        amount={betAmount}
        setAmount={setBetAmount}
        minAmount={pendingBetAction === 'bet' ? betMin : raiseMin}
        maxAmount={betMaxAmount}
        pot={pot}
        onConfirm={confirmBet}
        disabled={isActionPending}
      />

      {/* Fold Confirm Modal */}
      <FoldConfirmModal
        isOpen={showFoldConfirm}
        onClose={() => setShowFoldConfirm(false)}
        onConfirm={confirmFold}
        disabled={isActionPending}
      />

      {/* Error display */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm max-w-md text-center">
          {error}
        </div>
      )}
    </div>
  );
}
