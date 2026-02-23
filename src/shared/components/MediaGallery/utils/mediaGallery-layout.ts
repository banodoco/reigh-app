import {
  DEFAULT_ROWS_PER_PAGE,
  GRID_COLUMN_CLASSES,
  ROW_LIMITS,
  SKELETON_COLUMNS,
  TARGET_IMAGE_WIDTH,
} from './mediaGallery-constants';

function parseAspectRatio(aspectRatioStr: string | undefined | null): number {
  if (!aspectRatioStr) {
    return 16 / 9;
  }

  const parts = aspectRatioStr.split(':');
  if (parts.length !== 2) {
    return 16 / 9;
  }

  const width = parseFloat(parts[0]);
  const height = parseFloat(parts[1]);
  if (Number.isNaN(width) || Number.isNaN(height) || height === 0) {
    return 16 / 9;
  }

  return width / height;
}

function getEffectiveGap(reducedSpacing: boolean): number {
  if (!reducedSpacing) {
    return 16;
  }

  const isSmOrAbove = typeof window !== 'undefined' && window.innerWidth >= 640;
  return isSmOrAbove ? 16 : 8;
}

function getColumnsForAspectRatio(aspectRatio: number): number {
  const baseColumns = 5;
  const computed = Math.round(baseColumns / Math.sqrt(aspectRatio)) + 2;
  return Math.max(5, Math.min(9, computed));
}

function getTargetImageWidth(): number {
  return TARGET_IMAGE_WIDTH.BASE;
}

function calculateDynamicColumns(
  containerWidth: number,
  aspectRatio: number,
  gap: number = 16
): number {
  if (!containerWidth || containerWidth <= 0) {
    return getColumnsForAspectRatio(aspectRatio);
  }

  const targetWidth = getTargetImageWidth();
  const effectiveWidth = targetWidth + gap;
  const columns = Math.floor((containerWidth + gap) / effectiveWidth);
  return Math.max(
    TARGET_IMAGE_WIDTH.MIN_COLUMNS,
    Math.min(TARGET_IMAGE_WIDTH.MAX_COLUMNS, columns)
  );
}

function calculateDynamicRows(
  containerWidth: number,
  containerHeight: number,
  columns: number,
  aspectRatio: number,
  gap: number = 16
): number {
  if (!containerWidth || containerWidth <= 0 || !containerHeight || containerHeight <= 0) {
    return DEFAULT_ROWS_PER_PAGE.DESKTOP;
  }

  const totalGapWidth = (columns - 1) * gap;
  const imageWidth = (containerWidth - totalGapWidth) / columns;
  const imageHeight = imageWidth / aspectRatio;
  const effectiveHeight = imageHeight + gap;
  const usableHeight = containerHeight - imageHeight * 0.5;
  const rows = Math.floor((usableHeight + gap) / effectiveHeight);

  return Math.max(
    ROW_LIMITS.MIN_ROWS,
    Math.min(ROW_LIMITS.MAX_ROWS, rows)
  );
}

export function calculateGalleryLayout(
  aspectRatioStr: string | undefined | null,
  isMobile: boolean,
  containerWidth?: number,
  containerHeight?: number,
  reducedSpacing: boolean = false
): {
  columns: number;
  rows: number;
  itemsPerPage: number;
  skeletonColumns: typeof SKELETON_COLUMNS[keyof typeof SKELETON_COLUMNS];
  gridColumnClasses: string;
} {
  const ratio = parseAspectRatio(aspectRatioStr);
  const gap = getEffectiveGap(reducedSpacing);

  const rawColumns = containerWidth && containerWidth > 0
    ? calculateDynamicColumns(containerWidth, ratio, gap)
    : getColumnsForAspectRatio(ratio);

  const clampedColumns = Math.max(3, Math.min(12, rawColumns)) as keyof typeof GRID_COLUMN_CLASSES;

  const rows = (!isMobile && containerWidth && containerWidth > 0 && containerHeight && containerHeight > 0)
    ? calculateDynamicRows(containerWidth, containerHeight, rawColumns, ratio, gap)
    : (isMobile ? DEFAULT_ROWS_PER_PAGE.MOBILE : DEFAULT_ROWS_PER_PAGE.DESKTOP);

  const itemsPerPage = rawColumns * rows;
  const skeletonColumns = SKELETON_COLUMNS[clampedColumns] || SKELETON_COLUMNS[5];
  const gridColumnClasses = GRID_COLUMN_CLASSES[clampedColumns];

  return {
    columns: rawColumns,
    rows,
    itemsPerPage,
    skeletonColumns,
    gridColumnClasses,
  };
}
