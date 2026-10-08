/** Design System Tokens - Casino-inspired modern aesthetic */

export const colors = {
  // Core brand - deep felt green with gold accent
  felt: {
    50: '#f0f7f0',
    100: '#dceadc',
    200: '#bcd5bc',
    300: '#8dbb8d',
    400: '#5a9d5a',
    500: '#2d7d32',      // Primary brand - poker table felt
    600: '#256629',
    700: '#1e5020',
    800: '#1a421c',
    900: '#163818',
    950: '#0a1e0c',
  },

  gold: {
    50: '#fffbf0',
    100: '#fff3cc',
    200: '#ffe799',
    300: '#ffd666',
    400: '#ffc533',
    500: '#ffb300',      // Primary accent - chips, highlights
    600: '#cc8f00',
    700: '#996b00',
    800: '#735200',
    900: '#5c4200',
    950: '#332400',
  },

  // Semantic colors
  surface: {
    light: '#ffffff',
    dark: '#1a1a2e',
    elevated: '#f8f9fa',
    elevatedDark: '#16213e',
  },

  text: {
    primary: '#1a1a2e',
    primaryDark: '#e8e8e8',
    secondary: '#4a4a6a',
    secondaryDark: '#a0a0b8',
    muted: '#6b6b8a',
    mutedDark: '#787898',
    inverse: '#ffffff',
  },

  // Status colors
  success: {
    light: '#2d7d32',
    dark: '#4caf50',
  },
  warning: {
    light: '#f57c00',
    dark: '#ffb74d',
  },
  error: {
    light: '#c62828',
    dark: '#ef5350',
  },
  info: {
    light: '#1565c0',
    dark: '#64b5f6',
  },

  // Card suits
  suits: {
    spades: '#1a1a2e',
    hearts: '#c62828',
    diamonds: '#c62828',
    clubs: '#1a1a2e',
  },

  // Border
  border: {
    light: '#e0e0e0',
    dark: '#3d3d5c',
    focus: '#ffb300',
  },

  // Overlay
  overlay: 'rgba(26, 26, 46, 0.7)',
};

export const typography = {
  fontFamilies: {
    display: '"DM Serif Display", Georgia, serif',
    ui: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    mono: '"JetBrains Mono", "Fira Code", monospace',
  },

  fontSizes: {
    xs: '0.75rem',    // 12px
    sm: '0.875rem',   // 14px
    base: '1rem',     // 16px
    lg: '1.125rem',   // 18px
    xl: '1.25rem',    // 20px
    '2xl': '1.5rem',  // 24px
    '3xl': '2rem',    // 32px
    '4xl': '2.5rem',  // 40px
    '5xl': '3.5rem',  // 56px
  },

  fontWeights: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  lineHeights: {
    tight: 1.1,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
  },

  letterSpacings: {
    tight: '-0.02em',
    normal: '0',
    wide: '0.02em',
    wider: '0.1em',
  },
};

export const spacing = {
  0: '0',
  1: '0.25rem',   // 4px
  2: '0.5rem',    // 8px
  3: '0.75rem',   // 12px
  4: '1rem',      // 16px
  5: '1.25rem',   // 20px
  6: '1.5rem',    // 24px
  8: '2rem',      // 32px
  10: '2.5rem',   // 40px
  12: '3rem',     // 48px
  16: '4rem',     // 64px
  20: '5rem',     // 80px
  24: '6rem',     // 96px
};

export const radii = {
  none: '0',
  sm: '0.375rem',   // 6px
  md: '0.5rem',     // 8px
  lg: '0.75rem',    // 12px
  xl: '1rem',       // 16px
  '2xl': '1.5rem',  // 24px
  full: '9999px',
};

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
  inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
  // Card-specific shadows
  card: '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)',
  cardHover: '0 8px 24px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.12)',
  chip: '0 2px 4px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
  modal: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
};

export const transitions = {
  fast: '150ms cubic-bezier(0.4, 0, 0.2, 1)',
  normal: '200ms cubic-bezier(0.4, 0, 0.2, 1)',
  slow: '300ms cubic-bezier(0.4, 0, 0.2, 1)',
};

export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px',
};

export const zIndices = {
  hide: -1,
  base: 0,
  dropdown: 100,
  sticky: 200,
  fixed: 300,
  modalBackdrop: 400,
  modal: 500,
  popover: 600,
  tooltip: 700,
  toast: 800,
};

export const cardSizes = {
  sm: { width: '40px', height: '56px', fontSize: '0.625rem', symbolSize: '1rem' },
  md: { width: '56px', height: '78px', fontSize: '0.75rem', symbolSize: '1.5rem' },
  lg: { width: '72px', height: '100px', fontSize: '0.875rem', symbolSize: '2rem' },
  xl: { width: '88px', height: '122px', fontSize: '1rem', symbolSize: '2.5rem' },
};

export const chipSizes = {
  sm: '28px',
  md: '40px',
  lg: '56px',
  xl: '72px',
};

export const chipColors = {
  white: { base: '#ffffff', edge: '#e0e0e0', text: '#1a1a2e', value: 1 },
  red: { base: '#c62828', edge: '#8b1a1a', text: '#ffffff', value: 5 },
  blue: { base: '#1565c0', edge: '#0d47a1', text: '#ffffff', value: 10 },
  green: { base: '#2d7d32', edge: '#1b5e20', text: '#ffffff', value: 25 },
  black: { base: '#1a1a2e', edge: '#000000', text: '#ffb300', value: 100 },
  purple: { base: '#6a1b9a', edge: '#4a148c', text: '#ffffff', value: 500 },
  orange: { base: '#e65100', edge: '#bf360c', text: '#ffffff', value: 1000 },
};