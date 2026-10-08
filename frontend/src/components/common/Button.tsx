/** Button component with design system integration */
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { shadows } from '../../design/tokens';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'gold' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  fullWidth?: boolean;
}

const baseStyles = `
  inline-flex items-center justify-center font-medium rounded-xl
  transition-all duration-200 ease-out
  focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2
  disabled:opacity-50 disabled:cursor-not-allowed
  whitespace-nowrap
`;

const variantStyles = {
  primary: `
    bg-felt-500 text-white border border-felt-600
    hover:bg-felt-600 active:bg-felt-700
    focus-visible:ring-felt-500
    shadow-md
  `,
  secondary: `
    bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600
    hover:bg-gray-200 dark:hover:bg-gray-700 active:bg-gray-300 dark:active:bg-gray-600
    focus-visible:ring-gray-500
  `,
  gold: `
    bg-gold-500 text-felt-950 border border-gold-600
    hover:bg-gold-400 active:bg-gold-600
    focus-visible:ring-gold-500
    shadow-md
    font-semibold
  `,
  ghost: `
    bg-transparent text-gray-700 dark:text-gray-300 border border-transparent
    hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700
    focus-visible:ring-gray-500
  `,
  danger: `
    bg-error-light text-white border border-error-light
    hover:bg-error-dark active:bg-error-light
    focus-visible:ring-error-light
    shadow-md
  `,
  success: `
    bg-success-light text-white border border-success-light
    hover:bg-success-dark active:bg-success-light
    focus-visible:ring-success-light
    shadow-md
  `,
};

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-5 py-2.5 text-base gap-2',
  lg: 'px-7 py-3.5 text-lg gap-2.5',
  xl: 'px-10 py-4.5 text-xl gap-3',
};

const fullWidthStyles = {
  true: 'w-full',
  false: '',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    children,
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    disabled,
    className = '',
    style,
    ...props
  }, ref) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${fullWidthStyles[fullWidth]} ${className}`}
        disabled={isDisabled}
        style={{
          ...style,
          boxShadow: ['primary', 'gold', 'danger', 'success'].includes(variant) ? shadows.md : undefined,
        }}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-4 w-4 sm:h-5 sm:w-5 lg:h-6 lg:w-6"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        )}
        {!loading && children}
      </button>
    );
  }
);

Button.displayName = 'Button';

/** Chip button for bet amounts */
export function ChipButton({
  children,
  onClick,
  active = false,
  disabled = false,
  size = 'md',
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const sizeMap = {
    sm: 'px-3 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        inline-flex items-center justify-center font-semibold rounded-full
        transition-all duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500
        disabled:opacity-40 disabled:cursor-not-allowed
        ${sizeMap[size]}
        ${active
          ? 'bg-gold-500 text-felt-950 shadow-lg ring-2 ring-gold-500 ring-offset-2 ring-offset-felt-900'
          : 'bg-felt-700 text-gold-200 border border-felt-500 hover:bg-felt-600 hover:border-gold-400'
        }
        ${className}
      `}
    >
      {children}
    </button>
  );
}

/** Action button for game actions */
export function ActionButton({
  children,
  onClick,
  variant = 'default',
  disabled = false,
  loading = false,
  className = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'primary' | 'danger' | 'gold';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  const variants = {
    default: 'bg-felt-700 text-gold-200 border border-felt-500 hover:bg-felt-600 hover:border-gold-400',
    primary: 'bg-felt-500 text-white border border-felt-600 hover:bg-felt-600',
    danger: 'bg-error-light text-white border border-error-light hover:bg-error-dark',
    gold: 'bg-gold-500 text-felt-950 border border-gold-600 hover:bg-gold-400 font-semibold',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center font-medium rounded-xl px-4 py-2.5 text-base
        transition-all duration-150
        focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]}
        ${className}
      `}
    >
      {loading ? (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        children
      )}
    </button>
  );
}