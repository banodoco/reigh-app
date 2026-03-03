import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useShotActionController } from './useShotActionController';

function buildArgs(overrides: Partial<Parameters<typeof useShotActionController>[0]> = {}) {
  return {
    imageId: 'image-1',
    selectedShotId: 'shot-1',
    simplifiedShotOptions: [{ id: 'shot-1', name: 'Shot 1' }],
    showTickForImageId: null,
    isAlreadyPositionedInSelectedShot: false,
    isAlreadyAssociatedWithoutPosition: false,
    onNavigateToShot: vi.fn(),
    onAddToShot: vi.fn(async () => undefined),
    onAddToShotWithoutPosition: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('useShotActionController', () => {
  it('navigates to selected shot instead of adding when image is already in shot context', async () => {
    const args = buildArgs({ showTickForImageId: 'image-1' });
    const stopPropagation = vi.fn();

    const { result } = renderHook(() => useShotActionController(args));

    await act(async () => {
      await result.current.handleAddToShotIntent({ stopPropagation } as never);
    });

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(args.onNavigateToShot).toHaveBeenCalledWith({ id: 'shot-1', name: 'Shot 1' });
    expect(args.onAddToShot).not.toHaveBeenCalled();
  });

  it('adds to shot when navigation path is not active', async () => {
    const args = buildArgs({ selectedShotId: 'missing-shot' });

    const { result } = renderHook(() => useShotActionController(args));

    await act(async () => {
      await result.current.handleAddToShotIntent({ stopPropagation: vi.fn() } as never);
    });

    expect(args.onNavigateToShot).not.toHaveBeenCalled();
    expect(args.onAddToShot).toHaveBeenCalledTimes(1);
  });

  it('navigates for already-associated-without-position, otherwise creates association', async () => {
    const navigateArgs = buildArgs({ isAlreadyAssociatedWithoutPosition: true });
    const { result: navigateResult } = renderHook(() => useShotActionController(navigateArgs));

    await act(async () => {
      await navigateResult.current.handleAddWithoutPositionIntent({ stopPropagation: vi.fn() } as never);
    });
    expect(navigateArgs.onNavigateToShot).toHaveBeenCalledTimes(1);
    expect(navigateArgs.onAddToShotWithoutPosition).not.toHaveBeenCalled();

    const addArgs = buildArgs({ isAlreadyAssociatedWithoutPosition: false });
    const { result: addResult } = renderHook(() => useShotActionController(addArgs));

    await act(async () => {
      await addResult.current.handleAddWithoutPositionIntent({ stopPropagation: vi.fn() } as never);
    });
    expect(addArgs.onAddToShotWithoutPosition).toHaveBeenCalledTimes(1);
  });
});
