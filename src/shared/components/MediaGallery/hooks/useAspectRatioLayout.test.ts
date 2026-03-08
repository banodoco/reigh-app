import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAspectRatioLayout } from './useAspectRatioLayout';

const mocks = vi.hoisted(() => ({
  calculateGalleryLayout: vi.fn(),
}));

vi.mock('../utils', () => ({
  GRID_COLUMN_CLASSES: {
    2: 'grid-cols-2',
    4: 'grid-cols-4',
    5: 'grid-cols-5',
  },
  calculateGalleryLayout: (...args: unknown[]) => mocks.calculateGalleryLayout(...args),
}));

describe('useAspectRatioLayout', () => {
  it('uses calculated columns/items when columnsPerRow is auto', () => {
    mocks.calculateGalleryLayout.mockReturnValue({
      columns: 4,
      itemsPerPage: 20,
      gridColumnClasses: 'grid-cols-fallback',
    });

    const { result } = renderHook(() =>
      useAspectRatioLayout({
        projectAspectRatio: '16:9',
        isMobile: false,
        containerWidth: 1024,
        reducedSpacing: false,
        columnsPerRow: 'auto',
      }),
    );

    expect(mocks.calculateGalleryLayout).toHaveBeenCalledWith('16:9', false, 1024, undefined, false);
    expect(result.current.effectiveColumnsPerRow).toBe(4);
    expect(result.current.actualItemsPerPage).toBe(20);
    expect(result.current.gridColumnClasses).toBe('grid-cols-4');
  });

  it('rounds itemsPerPage down to full rows for explicit columns', () => {
    mocks.calculateGalleryLayout.mockReturnValue({
      columns: 4,
      itemsPerPage: 20,
      gridColumnClasses: 'grid-cols-fallback',
    });

    const { result } = renderHook(() =>
      useAspectRatioLayout({
        projectAspectRatio: '9:16',
        isMobile: true,
        containerWidth: 360,
        reducedSpacing: true,
        columnsPerRow: 5,
        itemsPerPage: 13,
      }),
    );

    expect(result.current.effectiveColumnsPerRow).toBe(5);
    expect(result.current.actualItemsPerPage).toBe(10);
    expect(result.current.gridColumnClasses).toBe('grid-cols-5');
  });

  it('falls back to computed class and minimum row size when custom columns are unmapped', () => {
    mocks.calculateGalleryLayout.mockReturnValue({
      columns: 3,
      itemsPerPage: 12,
      gridColumnClasses: 'grid-cols-fallback',
    });

    const { result } = renderHook(() =>
      useAspectRatioLayout({
        projectAspectRatio: undefined,
        isMobile: false,
        containerWidth: 800,
        reducedSpacing: false,
        columnsPerRow: 6,
        itemsPerPage: 3,
      }),
    );

    expect(result.current.effectiveColumnsPerRow).toBe(6);
    expect(result.current.actualItemsPerPage).toBe(6);
    expect(result.current.gridColumnClasses).toBe('grid-cols-fallback');
  });
});
