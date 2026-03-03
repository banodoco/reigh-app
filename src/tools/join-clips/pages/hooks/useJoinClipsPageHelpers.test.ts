import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useEnsureKeepBridgingImages,
  useJoinClipPairs,
  useJoinValidationResult,
  useRefreshOnVisibility,
  useSyncJoinClipsLoras,
} from './useJoinClipsPageHelpers';

const mocks = vi.hoisted(() => ({
  calculateEffectiveFrameCount: vi.fn(),
  validateClipsForJoin: vi.fn(),
  projectPrefix: vi.fn((projectId: string) => ['unified', projectId]),
}));

vi.mock('@/tools/join-clips/utils/validation', () => ({
  calculateEffectiveFrameCount: (...args: unknown[]) => mocks.calculateEffectiveFrameCount(...args),
  validateClipsForJoin: (...args: unknown[]) => mocks.validateClipsForJoin(...args),
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    unified: {
      projectPrefix: (...args: unknown[]) => mocks.projectPrefix(...args),
    },
  },
}));

describe('useJoinClipsPageHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('syncs loras once per unique id:strength signature', () => {
    const joinSettings = { updateField: vi.fn() } as never;
    const selectedLoras = [
      { id: 'lora-a', strength: 0.8 },
      { id: 'lora-b', strength: 1.2 },
    ] as never;
    const { rerender } = renderHook(
      ({ loaded, loras }) => useSyncJoinClipsLoras(loaded, loras, joinSettings),
      {
        initialProps: { loaded: true, loras: selectedLoras },
      },
    );

    expect(joinSettings.updateField).toHaveBeenCalledWith('loras', [
      { id: 'lora-a', strength: 0.8 },
      { id: 'lora-b', strength: 1.2 },
    ]);

    rerender({ loaded: true, loras: [...selectedLoras] });
    expect(joinSettings.updateField).toHaveBeenCalledTimes(1);
  });

  it('defaults keepBridgingImages to false after settings load', () => {
    const joinSettings = { updateField: vi.fn() } as never;
    renderHook(() => useEnsureKeepBridgingImages(undefined, true, joinSettings));
    expect(joinSettings.updateField).toHaveBeenCalledWith('keepBridgingImages', false);
  });

  it('computes validation result only when clips are ready', () => {
    mocks.calculateEffectiveFrameCount.mockImplementation((seconds: number) => Math.round(seconds * 24));
    mocks.validateClipsForJoin.mockReturnValue({ valid: true, errors: [] });

    const { result } = renderHook(() =>
      useJoinValidationResult(
        [
          { url: 'a.mp4', durationSeconds: 2, metadataLoading: false },
          { url: 'b.mp4', durationSeconds: 3, metadataLoading: false },
        ] as never,
        12,
        8,
        false,
        true,
      ),
    );

    expect(mocks.validateClipsForJoin).toHaveBeenCalledWith(
      [
        expect.objectContaining({ name: 'Clip #1', frameCount: 48 }),
        expect.objectContaining({ name: 'Clip #2', frameCount: 72 }),
      ],
      12,
      8,
      false,
    );
    expect(result.current).toEqual({ valid: true, errors: [] });
  });

  it('builds adjacent clip pair info from valid clips', () => {
    mocks.calculateEffectiveFrameCount.mockImplementation((seconds: number) => Math.round(seconds * 10));
    const { result } = renderHook(() =>
      useJoinClipPairs(
        [
          { url: 'a.mp4', durationSeconds: 1.1, finalFrameUrl: 'a-final.jpg' },
          { url: 'b.mp4', durationSeconds: 2.2, posterUrl: 'b-poster.jpg' },
          { url: 'c.mp4', durationSeconds: 3.3, posterUrl: 'c-poster.jpg' },
        ] as never,
        false,
      ),
    );

    expect(result.current).toEqual([
      {
        pairIndex: 0,
        clipA: { name: 'Clip 1', frameCount: 11, finalFrameUrl: 'a-final.jpg' },
        clipB: { name: 'Clip 2', frameCount: 22, posterUrl: 'b-poster.jpg' },
      },
      {
        pairIndex: 1,
        clipA: { name: 'Clip 2', frameCount: 22, finalFrameUrl: undefined },
        clipB: { name: 'Clip 3', frameCount: 33, posterUrl: 'c-poster.jpg' },
      },
    ]);
  });

  it('invalidates project queries when tab becomes visible', () => {
    const invalidateQueries = vi.fn();
    renderHook(() =>
      useRefreshOnVisibility('project-1', { invalidateQueries } as never),
    );

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });

    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mocks.projectPrefix).toHaveBeenCalledWith('project-1');
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['unified', 'project-1'],
    });
  });
});
