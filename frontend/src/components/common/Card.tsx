/** Base card components with design system integration */
import { ReactNode, forwardRef, HTMLAttributes } from 'react';
import { shadows, radii, transitions } from '../../design/tokens';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'elevated' | 'outlined' | 'felt';
  interactive?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
}

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
  xl: 'p-10',
};

const variantClasses = {
  default: 'bg-gray-900 border border-gray-700',
  elevated: 'bg-gray-900',
  outlined: 'bg-transparent border-2 border-gray-600',
  felt: 'bg-gradient-to-br from-[#1e5020] via-[#256629] to-[#1e5020] border border-[#2d7d32] text-white',
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, variant = 'default', interactive = false, padding = 'md', className = '', style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`
          rounded-2xl
          ${variantClasses[variant]}
          ${paddingClasses[padding]}
          ${interactive ? 'cursor-pointer transition-all duration-200 hover:shadow-xl' : ''}
          ${className}
        `}
        style={{
          ...style,
          boxShadow: variant === 'elevated' ? shadows.card : variant === 'default' ? shadows.md : undefined,
        }}
        {...props}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';

interface CardHeaderProps extends HTMLAttributes<HTMLDivElement> {}

export const CardHeader = forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ children, className = '', ...props }, ref) => (
    <div ref={ref} className={`mb-4 pb-4 border-b border-gray-200 dark:border-[#3d3d5c] ${className}`} {...props}>
      {children}
    </div>
  )
);

CardHeader.displayName = 'CardHeader';

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const CardTitle = forwardRef<HTMLHeadingElement, CardTitleProps>(
  ({ children, size = 'lg', className = '', ...props }, ref) => (
    <h3
      ref={ref}
      className={`
        font-display font-medium text-text-primary dark:text-text-primaryDark
        ${size === 'sm' ? 'text-xl' : size === 'md' ? 'text-2xl' : size === 'lg' ? 'text-3xl' : 'text-4xl'}
        ${className}
      `}
      {...props}
    >
      {children}
    </h3>
  )
);

CardTitle.displayName = 'CardTitle';

interface CardDescriptionProps extends HTMLAttributes<HTMLParagraphElement> {}

export const CardDescription = forwardRef<HTMLParagraphElement, CardDescriptionProps>(
  ({ children, className = '', ...props }, ref) => (
    <p ref={ref} className={`text-text-secondary dark:text-text-secondaryDark mt-1 ${className}`} {...props}>
      {children}
    </p>
  )
);

CardDescription.displayName = 'CardDescription';

interface CardContentProps extends HTMLAttributes<HTMLDivElement> {}

export const CardContent = forwardRef<HTMLDivElement, CardContentProps>(
  ({ children, className = '', ...props }, ref) => (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  )
);

CardContent.displayName = 'CardContent';

interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {}

export const CardFooter = forwardRef<HTMLDivElement, CardFooterProps>(
  ({ children, className = '', ...props }, ref) => (
    <div ref={ref} className={`mt-4 pt-4 border-t border-gray-200 dark:border-[#3d3d5c] flex items-center ${className}`} {...props}>
      {children}
    </div>
  )
);

CardFooter.displayName = 'CardFooter';