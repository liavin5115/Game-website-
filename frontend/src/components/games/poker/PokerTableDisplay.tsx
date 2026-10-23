/** Presentational poker table component - takes all data as props */
import { useMemo } from 'react';
import { Card } from './Card';
import { Button } from '../../common/Button';
import { Modal } from '../../common/Modal';
import { Input } from '../../common/Input';
import { chipColors } from '../../../design/tokens';
import { formatNet, formatPoints } from '../../../lib/format';
import { seatPositionsBySeat } from '../../../lib/pokerSeat';
import type { PokerResult } from '../../../types';

const STREET_LABELS = ['Preflop', 'Flop', 'Turn', 'River', 'Showdown'];

const STATUS_BADGE_STYLES: Record<string, string> = {
  folded: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  allin: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  away: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
  disconnected: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  auto_acted: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
};

const CARD_SIZE_MD = { width: '56px', height: '78px' };

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
  isLowTime,
  compact = false,
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
}) {
  const showCards = isMe || status === 'showdown' || isShowdown;
  const isFolded = status === 'folded';
  const isAllIn = status === 'allin' || status === 'all_in';
  const isAway = status === 'away';
  const cardSize = compact ? 'xs' : 'sm';
  const showNet = revealActive && (revealRemaining <= 2 || !showdown) && result;
  const dimmed = revealActive && !isWinner;

  return (
    <div
      className={`flex flex-col items-center transition-all duration-200 ${
        compact ? 'min-w-[112px] gap-1' : 'min-w-[140px] gap-1.5'
      } ${
        isCurrentTurn && !isFinished ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''
      } ${isWinner && revealActive ? 'ring-2 ring-green-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900 rounded-xl' : ''} ${
        dimmed ? 'opacity-40' : ''
      }`}
    >
      {/* Top badges row: fixed slot so the timer never shifts the name */}
      <div className={`flex items-center gap-0.5 w-full justify-center ${compact ? 'h-6' : 'min-h-[32px] gap-1'}`}>
        {isDealer && (
          <Badge compact={compact} className="bg-white text-gray-900 border border-gray-300 dark:bg-gray-800 dark:text-white dark:border-gray-600" title="Dealer">
            D
          </Badge>
        )}
        {isSB && <Badge compact={compact} className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" title="Small Blind">SB</Badge>}
        {isBB && <Badge compact={compact} className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" title="Big Blind">BB</Badge>}
        {showTimer && (
          <TimerRing
            remaining={remaining ?? 0}
            totalSeconds={turnSeconds ?? 30}
            isLowTime={isLowTime ?? false}
            size={compact ? 'sm' : 'md'}
            className={`flex-shrink-0 ${compact ? 'ml-1' : 'ml-2'}`}
          />
        )}
      </div>

      {/* Name and (You) */}
      <div className="flex items-center gap-1 text-center">
        <span className={`font-medium text-gray-900 dark:text-white truncate ${compact ? 'text-xs max-w-[86px]' : 'text-sm max-w-[120px]'}`}>
          {player.username}
        </span>
        {isMe && (
          <Badge compact={compact} className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex-shrink-0">
            You
          </Badge>
        )}
      </div>

      {/* Cards */}
      <div className={`flex gap-0.5 items-end ${compact ? 'min-h-[40px]' : 'min-h-[56px]'}`}>
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
      <div className={`num flex items-baseline gap-1 font-semibold text-gray-900 dark:text-white ${compact ? 'text-[11px]' : 'text-xs'}`}>
        <span>{formatPoints(isFinished && result ? result.payout : player.chips)}</span>
        {player.bet > 0 && (
          <span className="text-yellow-600 dark:text-yellow-400 font-normal">Â· {formatPoints(player.bet)}</span>
        )}
      </div>

      {isFinished && showdown && (result?.hand_description || result?.hand_name) && (
        <span className={`text-center font-medium text-green-700 dark:text-green-300 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
          {result.hand_description || result.hand_name}
        </span>
      )}

      {showNet && (
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
      )}

      {/* Status badges: at most one secondary status in compact mode so the
          row never wraps and grows into the seat below. */}
      <div className="flex flex-wrap items-center justify-center gap-0.5">
        {isFolded && <Badge compact={compact} className={STATUS_BADGE_STYLES.folded}>Folded</Badge>}
        {isAllIn && <Badge compact={compact} className={STATUS_BADGE_STYLES.allin}>All-in</Badge>}
        {!connected && !isMe && <Badge compact={compact} className={STATUS_BADGE_STYLES.disconnected}>Disconnected</Badge>}
        {isAway && (connected || !compact) && <Badge compact={compact} className={STATUS_BADGE_STYLES.away}>Away</Badge>}
        {autoActed && !isAway && <Badge compact={compact} className={STATUS_BADGE_STYLES.auto_acted}>Auto-acted</Badge>}
        {isCurrentTurn && !isFinished && !isFolded && !isAllIn && !isAway && (
          <Badge compact={compact} className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 animate-pulse">Your Turn</Badge>
        )}
      </div>
    </div>
  );
}

function CommunityCards({
  cards,
  street,
  highlightCards = [],
  dimNonWinning = false,
}: {
  cards: string[];
  street: number;
  highlightCards?: string[];
  dimNonWinning?: boolean;
}) {
  return (
    <div className="flex justify-center gap-2 flex-wrap">
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
              className={`${CARD_SIZE_MD.width} ${CARD_SIZE_MD.height} rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700`}
              style={{ aspectRatio: '5/7' }}
              aria-label={`Community card slot ${i + 1}`}
            />
          )}
        </div>
      ))}
      <div className="w-full text-center mt-2 text-sm text-gray-500 dark:text-gray-400">
        {STREET_LABELS[street] || `Street ${street}`}
      </div>
    </div>
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
  // Positions indexed by absolute seat. relativeIndex 0 (me, or seat 0 for a
  // watcher) is bottom center; the rest run clockwise. The math lives in
  // lib/pokerSeat.ts so it is unit-tested for n = 2, 3, 6 and 10.
  const seatPositions = useMemo(
    () => seatPositionsBySeat(numPlayers, mySeat),
    [numPlayers, mySeat],
  );

  const pot = gameState?.pot ?? 0;
  const isFinished = game?.status === 'finished';
  // After settlement the pot has been paid out, so the center shows 0. The
  // settled total is still available (potTotal) for the result panel.
  const centerPot = isFinished ? 0 : pot;
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
        <div className={`w-full max-w-6xl mx-auto aspect-[3/2] relative ${numPlayers >= 6 ? 'min-h-[540px]' : 'min-h-[400px] max-h-[70vh]'}`}>
          {/* Felt table background */}
          <div className="absolute inset-0 rounded-[50%] bg-gradient-to-br from-felt-700 via-felt-600 to-felt-800 border-4 border-felt-900 shadow-2xl overflow-hidden">
            <div className="absolute inset-0 opacity-5" style={{
              backgroundImage: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.3) 100%)',
            }} />
          </div>

          {/* Center area: community cards + pot + info */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 pointer-events-none">
            <div className="pointer-events-auto z-10">
              <CommunityCards
                cards={gameState.community_cards || []}
                street={street}
                highlightCards={winningCards}
                dimNonWinning={revealActive && showdown}
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
            </div>
          </div>

          {/* Seats around ellipse */}
          {players.map((player, idx) => {
            const pos = seatPositions[idx];
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
                className="absolute pointer-events-auto z-10"
                style={{
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
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
                  compact={numPlayers >= 6}
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

      {/* Desktop Action Bar (fixed bottom while playing, inline when finished) */}
      <div
        className={`md:block hidden max-w-6xl mx-auto z-20 ${
          isFinished ? 'relative mt-4' : 'fixed bottom-0 left-0 right-0 px-4 pb-4'
        }`}
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
