export const DEFAULT_ROWS_PER_PAGE = {
  MOBILE: 5,
  DESKTOP: 6,
} as const;

export const ROW_LIMITS = {
  MIN_ROWS: 2,
  MAX_ROWS: 12,
} as const;

export const TARGET_IMAGE_WIDTH = {
  BASE: 100,
  MIN_COLUMNS: 2,
  MAX_COLUMNS: 24,
  // Kept for backward compatibility. Runtime gap uses getEffectiveGap().
  GAP: 8,
} as const;

export const DEFAULT_ITEMS_PER_PAGE = {
  MOBILE: 20,
  DESKTOP: 45,
} as const;

export const GRID_COLUMN_CLASSES = {
  2: 'grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6',
  7: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-7',
  8: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8',
  9: 'grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9',
  10: 'grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 2xl:grid-cols-10',
  11: 'grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-11',
  12: 'grid-cols-4 sm:grid-cols-6 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-10 2xl:grid-cols-12',
} as const;

export const SKELETON_COLUMNS = {
  2: { base: 1, sm: 2, md: 2, lg: 2, xl: 2, '2xl': 2 },
  3: { base: 1, md: 2, lg: 3, xl: 3, '2xl': 3 },
  4: { base: 2, sm: 3, md: 4, lg: 4, xl: 4, '2xl': 4 },
  5: { base: 2, sm: 3, md: 4, lg: 5, xl: 5, '2xl': 5 },
  6: { base: 2, sm: 3, md: 4, lg: 5, xl: 6, '2xl': 6 },
  7: { base: 3, sm: 4, md: 5, lg: 6, xl: 7, '2xl': 7 },
  8: { base: 3, sm: 4, md: 5, lg: 6, xl: 7, '2xl': 8 },
  9: { base: 3, sm: 5, md: 6, lg: 7, xl: 8, '2xl': 9 },
  10: { base: 3, sm: 5, md: 6, lg: 8, xl: 9, '2xl': 10 },
  11: { base: 3, sm: 5, md: 7, lg: 8, xl: 10, '2xl': 11 },
  12: { base: 4, sm: 6, md: 7, lg: 9, xl: 10, '2xl': 12 },
} as const;
