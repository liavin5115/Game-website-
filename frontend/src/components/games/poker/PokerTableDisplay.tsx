/** Presentational poker table component - takes all data as props */
import { useMemo } from 'react';
import { Card } from './Card';
import { Button } from '../../common/Button';
import { chipColors } from '../../../design/tokens';

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
      className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-mono font-bold"
      style={{
        backgroundColor: `${color.base}20`,
        border: `1px solid ${color.edge}`,
        color: color.text,
      }}
    >
      <span style={{ backgroundColor: color.base, color: color.text }} className="w-3 h-3 rounded-full flex items-center justify-center text-[8px]" />
      {amount.toLocaleString()}
    </div>
  );
}

function Badge({ children, className = '', title }: { children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${className}`} title={title}>
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
  handleAction: (actionType: string, amount?: number) => void;
  handleBetAction: (actionType: string, minAmount: number, maxAmount: number) => void;
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
}) {
  const showCards = isMe || status === 'showdown';
  const isFolded = status === 'folded';
  const isAllIn = status === 'allin' || status === 'all_in';
  const isAway = status === 'away';

  return (
    <div
      className={`flex flex-col items-center gap-1.5 transition-all duration-200 ${
        isCurrentTurn ? 'ring-2 ring-yellow-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900' : ''
      }`}
    >
      {/* Top badges row */}
      <div className="flex items-center gap-1">
        {isDealer && (
          <Badge className="bg-white text-gray-900 border border-gray-300 dark:bg-gray-800 dark:text-white dark:border-gray-600" title="Dealer">
            D
          </Badge>
        )}
        {isSB && <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300" title="Small Blind">SB</Badge>}
        {isBB && <Badge className="bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300" title="Big Blind">BB</Badge>}
      </div>

      {/* Name and (You) */}
      <div className="flex items-center gap-1.5 text-center">
        <span className="font-medium text-gray-900 dark:text-white truncate max-w-[120px]">
          {player.username}
        </span>
        {isMe && (
          <Badge className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 ml-1 flex-shrink-0">
            You
          </Badge>
        )}
      </div>

      {/* Cards */}
      <div className="flex gap-1 min-h-[56px] items-end">
        {isFolded ? (
          <div className="flex gap-1 opacity-40">
            <Card card="??" faceDown size="sm" />
            <Card card="??" faceDown size="sm" />
          </div>
        ) : (
          player.cards.map((card: string, i: number) => (
            <Card
              key={i}
              card={showCards && card !== '??' ? card : '??'}
              faceDown={!showCards || card === '??'}
              size="sm"
            />
          ))
        )}
      </div>

      {/* Stack */}
      <div className="text-xs font-mono font-semibold text-gray-900 dark:text-white">
        {player.chips.toLocaleString()}
      </div>

      {/* Current bet as chip pill */}
      {player.bet > 0 && (
        <ChipPill amount={player.bet} />
      )}

      {/* Status badges */}
      <div className="flex flex-wrap items-center justify-center gap-1">
        {isFolded && <Badge className={STATUS_BADGE_STYLES.folded}>Folded</Badge>}
        {isAllIn && <Badge className={STATUS_BADGE_STYLES.allin}>All-in</Badge>}
        {isAway && <Badge className={STATUS_BADGE_STYLES.away}>Away</Badge>}
        {!connected && !isMe && <Badge className={STATUS_BADGE_STYLES.disconnected}>Disconnected</Badge>}
        {autoActed && <Badge className={STATUS_BADGE_STYLES.auto_acted}>Auto-acted</Badge>}
        {isCurrentTurn && !isFolded && !isAllIn && !isAway && (
          <Badge className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 animate-pulse">Your Turn</Badge>
        )}
      </div>
    </div>
  );
}

function CommunityCards({ cards, street }: { cards: string[]; street: number }) {
  return (
    <div className="flex justify-center gap-2 flex-wrap">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="relative">
          {i < cards.length ? (
            <Card card={cards[i]} size="md" />
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
}: {
  pot: number;
  sbAmount: number;
  bbAmount: number;
  currentTurnPlayerName?: string;
  phase: string;
  myValidActions: string[];
  isMyTurn: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
        <span>Blinds: {sbAmount}/{bbAmount}</span>
        <span className="text-yellow-600 dark:text-yellow-400 font-bold">Pot: {pot.toLocaleString()}</span>
      </div>
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
}: {
  remaining: number;
  totalSeconds: number;
  isLowTime: boolean;
}) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const progress = totalSeconds > 0 ? Math.max(0, Math.min(1, remaining / totalSeconds)) : 0;
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <div className="relative w-16 h-16 flex items-center justify-center">
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
      <span className={`absolute text-center font-mono font-bold text-xs ${isLowTime ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
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
  handleAction,
  handleBetAction,
}: PokerTableDisplayProps) {
  // Build seat order: start from me at bottom (index 0 in display), then clockwise
  const seatOrder = useMemo(() => {
    const order: number[] = [];
    for (let i = 0; i < numPlayers; i++) {
      order.push((mySeat + i) % numPlayers);
    }
    return order;
  }, [mySeat, numPlayers]);

  // Calculate seat positions for desktop (ellipse)
  const seatPositions = useMemo(() => {
    const positions: { x: number; y: number; angle: number }[] = [];
    // Ellipse dimensions (as percentages of container)
    const rx = 42; // horizontal radius %
    const ry = 30; // vertical radius %
    const centerX = 50;
    const centerY = 50;

    for (let i = 0; i < numPlayers; i++) {
      // Distribute evenly around ellipse, starting from bottom (270 degrees = -90)
      // But we want "me" at bottom, so we offset by seatOrder
      const displayIndex = seatOrder.indexOf(i);
      const angle = -90 + (displayIndex / numPlayers) * 360;
      const rad = (angle * Math.PI) / 180;
      const x = centerX + rx * Math.cos(rad);
      const y = centerY + ry * Math.sin(rad);
      positions.push({ x, y, angle });
    }
    return positions;
  }, [numPlayers, seatOrder]);

  return (
    <div className="relative min-h-screen bg-felt-500/10 dark:bg-felt-900/10 px-4 py-6">
      <ConnectionBanner showReconnectBanner={showReconnectBanner} isConnected={isConnected} />

      {/* Desktop: Oval Table Layout */}
      <div className="hidden md:block relative">
        <div className="max-w-6xl mx-auto aspect-[3/2] max-h-[70vh] relative">
          {/* Felt table background */}
          <div className="absolute inset-0 rounded-[50%] bg-gradient-to-br from-felt-700 via-felt-600 to-felt-800 border-4 border-felt-900 shadow-2xl overflow-hidden">
            {/* Inner felt pattern */}
            <div className="absolute inset-0 opacity-5" style={{
              backgroundImage: 'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.3) 100%)',
            }} />
          </div>

          {/* Center area: community cards + pot + info */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 pointer-events-none">
            <div className="pointer-events-auto z-10">
              <CommunityCards cards={gameState.community_cards || []} street={street} />
              <CenterInfo
                pot={gameState.pot || 0}
                sbAmount={sbAmount}
                bbAmount={bbAmount}
                currentTurnPlayerName={currentTurnPlayerName}
                phase={game.status}
                myValidActions={validActions}
                isMyTurn={isMyTurn}
              />
            </div>
          </div>

          {/* Seats around ellipse */}
          {players.map((player, idx) => {
            const pos = seatPositions[idx];
            const displayIdx = seatOrder.indexOf(idx);
            const isCurrent = displayIdx === seatOrder.indexOf(currentTurnIdx);
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
                  left: `calc(${pos.x}% - 80px)`,
                  top: `calc(${pos.y}% - 60px)`,
                  transform: `translate(-50%, -50%)`,
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
                />
                {/* Timer ring on active seat */}
                {isCurrent && game.status === 'in_progress' && (
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2">
                    <TimerRing remaining={remaining} totalSeconds={turnSeconds} isLowTime={isLowTime} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: Stacked Layout */}
      <div className="md:hidden space-y-4">
        {/* Community cards & pot at top */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 border dark:border-gray-700">
          <CommunityCards cards={gameState.community_cards || []} street={street} />
          <CenterInfo
            pot={gameState.pot || 0}
            sbAmount={sbAmount}
            bbAmount={bbAmount}
            currentTurnPlayerName={currentTurnPlayerName}
            phase={game.status}
            myValidActions={validActions}
            isMyTurn={isMyTurn}
          />
          {game.status === 'in_progress' && (
            <div className="mt-4 flex items-center justify-center gap-4">
              <TimerRing remaining={remaining} totalSeconds={turnSeconds} isLowTime={isLowTime} />
              <div className={`text-sm font-mono font-bold ${isLowTime ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
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
                  const displayIdx = seatOrder.indexOf(actualIdx);
                  const isCurrent = displayIdx === seatOrder.indexOf(currentTurnIdx);
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
                <div className="text-xs font-mono font-semibold text-gray-900 dark:text-white">{me.chips.toLocaleString()}</div>
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

            {game.status === 'in_progress' && isMyTurn && validActions.length > 0 && (
              <div className="flex flex-wrap justify-center gap-2">
                {validActions.map((action) => {
                  const isBetOrRaise = action === 'bet' || action === 'raise';
                  return (
                    <Button
                      key={action}
                      variant={action === 'fold' ? 'danger' : 'primary'}
                      size="sm"
                      onClick={() => isBetOrRaise ? handleBetAction(action, 0, me.chips) : handleAction(action)}
                      disabled={isActionPending || remaining <= 0 || !isConnected}
                    >
                      {action.charAt(0).toUpperCase() + action.slice(1)}
                    </Button>
                  );
                })}
              </div>
            )}

            {!isMyTurn && game.status === 'in_progress' && (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                Waiting for {currentTurnPlayerName || 'opponent'}...
              </p>
            )}

            {me.status === 'folded' && (
              <p className="text-center text-sm text-gray-500 dark:text-gray-400">You folded</p>
            )}
          </div>
        )}
      </div>

      {/* Error display */}
      {error && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm max-w-md text-center">
          {error}
        </div>
      )}
    </div>
  );
}