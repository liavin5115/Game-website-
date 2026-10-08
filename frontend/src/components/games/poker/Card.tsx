/** Playing card component with proper sizing and styling */
import { ReactNode } from 'react';

interface CardProps {
  card: string;
  faceDown?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: ReactNode;
}

const rankDisplay: Record<string, string> = {
  '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  'T': '10', 'J': 'J', 'Q': 'Q', 'K': 'K', 'A': 'A',
};

const suitDisplay: Record<string, { symbol: string }> = {
  'c': { symbol: '♣' },
  'd': { symbol: '♦' },
  'h': { symbol: '♥' },
  's': { symbol: '♠' },
};

const sizes = {
  sm: { width: 'w-10', height: 'h-14', font: 'text-[10px]', center: 'text-lg', padding: 'p-0.5' },
  md: { width: 'w-16', height: 'h-22', font: 'text-xs', center: 'text-2xl', padding: 'p-1' },
  lg: { width: 'w-20', height: 'h-28', font: 'text-sm', center: 'text-3xl', padding: 'p-1.5' },
};

export function Card({ card, faceDown = false, size = 'md', className = '', children }: CardProps) {
  const sizeConfig = sizes[size];

  // Face-down card (hidden)
  if (faceDown || (card === '??')) {
    return (
      <div
        className={`${sizeConfig.width} ${sizeConfig.height} rounded-lg relative overflow-hidden ${className}`}
        style={{ aspectRatio: '5/7' }}
      >
        {/* Card back pattern */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900 via-blue-800 to-blue-900">
          <div className="absolute inset-1 border border-blue-600 rounded opacity-50" />
          <div className="absolute inset-2 bg-blue-700 rounded opacity-30"
            style={{
              backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(59, 130, 246, 0.3) 4px, rgba(59, 130, 246, 0.3) 8px)'
            }}
          />
        </div>
        {children}
      </div>
    );
  }

  const rank = card[0];
  const suit = card[1];
  const { symbol } = suitDisplay[suit] || { symbol: '?' };
  const isRed = suit === 'd' || suit === 'h';

  return (
    <div
      className={`${sizeConfig.width} ${sizeConfig.height} rounded-lg relative overflow-hidden bg-white dark:bg-gray-50 border-2 border-gray-300 dark:border-gray-400 shadow-md ${className}`}
      style={{ aspectRatio: '5/7' }}
    >
      {/* Top-left corner */}
      <div className={`absolute top-0 left-0 ${sizeConfig.padding} ${sizeConfig.font}`}>
        <div className={`font-bold leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
          {rankDisplay[rank]}
        </div>
        <div className={`leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
          {symbol}
        </div>
      </div>

      {/* Center suit */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${sizeConfig.center} font-bold ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
          {symbol}
        </span>
      </div>

      {/* Bottom-right corner (rotated) */}
      <div className={`absolute bottom-0 right-0 ${sizeConfig.padding} ${sizeConfig.font} rotate-180`}>
        <div className={`font-bold leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
          {rankDisplay[rank]}
        </div>
        <div className={`leading-none ${isRed ? 'text-red-600' : 'text-gray-900'}`}>
          {symbol}
        </div>
      </div>

      {children}
    </div>
  );
}
