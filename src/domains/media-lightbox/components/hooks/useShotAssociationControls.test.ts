// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useShotAssociationControls } from './useShotAssociationControls';

const { normalizeAndPresentErrorMock } = vi.hoisted(() => ({
  normalizeAndPresentErrorMock: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: normalizeAndPresentErrorMock,
}));

function buildInput(overrides: Partial<Parameters<typeof useShotAssociationControls>[0]> = {}) {
  return {
    mediaId: 'media-1',
    imageUrl: 'https://cdn.example.com/media-1.png',
    thumbUrl: 'https://cdn.example.com/media-1-thumb.png',
    allShots: [
      { id: 'shot-a', name: 'Shot A' },
      { id: 'shot-b', name: 'Shot B' },
    ],
    selectedShotId: 'shot-a',
    isAlreadyAssociatedWithoutPosition: false,
    showTickForSecondaryImageId: null,
    onAddToShotWithoutPosition: vi.fn(async () => true),
    onShowSecondaryTick: vi.fn(),
    onOptimisticUnpositioned: vi.fn(),
    onNavigateToShot: vi.fn(),
    errorContext: 'test.useShotAssociationControls',
    ...overrides,
  };
}

describe('useShotAssociationControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves selected shot and supports jump action', () => {
    const input = buildInput();
    const { result } = renderHook(() => useShotAssociationControls(input));

    expect(result.current.selectedShot).toEqual({ id: 'shot-a', name: 'Shot A' });

    result.current.handleJumpToSelectedShot();
    expect(input.onNavigateToShot).toHaveBeenCalledWith({ id: 'shot-a', name: 'Shot A' });
  });

  it('handles add-without-position happy path and tick/optimistic updates', async () => {
    const input = buildInput();
    const { result } = renderHook(() => useShotAssociationControls(input));

    await result.current.handleAddWithoutPosition();

    expect(input.onAddToShotWithoutPosition).toHaveBeenCalledWith(
      'shot-a',
      'media-1',
      'https://cdn.example.com/media-1.png',
      'https://cdn.example.com/media-1-thumb.png',
    );
    expect(input.onShowSecondaryTick).toHaveBeenCalledWith('media-1');
    expect(input.onOptimisticUnpositioned).toHaveBeenCalledWith('media-1', 'shot-a');
  });

  it('navigates instead of adding when media already added without position', async () => {
    const input = buildInput({
      isAlreadyAssociatedWithoutPosition: true,
    });
    const { result } = renderHook(() => useShotAssociationControls(input));

    await result.current.handleAddWithoutPosition();

    expect(input.onAddToShotWithoutPosition).not.toHaveBeenCalled();
    expect(input.onNavigateToShot).toHaveBeenCalledWith({ id: 'shot-a', name: 'Shot A' });
  });

  it('reports errors from add callback', async () => {
    const error = new Error('add failed');
    const input = buildInput({
      onAddToShotWithoutPosition: vi.fn(async () => {
        throw error;
      }),
    });
    const { result } = renderHook(() => useShotAssociationControls(input));

    await result.current.handleAddWithoutPosition();

    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(error, {
      context: 'test.useShotAssociationControls',
      showToast: false,
    });
  });
});
