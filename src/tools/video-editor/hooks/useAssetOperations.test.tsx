// @vitest-environment jsdom
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider';
import { useAssetOperations } from '@/tools/video-editor/hooks/useAssetOperations';

function makeProvider(overrides: Partial<DataProvider> = {}): DataProvider {
  return {
    loadTimeline: vi.fn(async () => ({
      config: {
        output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
        clips: [],
        tracks: [],
      },
      configVersion: 1,
    })),
    saveTimeline: vi.fn(async () => 1),
    loadAssetRegistry: vi.fn(async () => ({ assets: {} })),
    resolveAssetUrl: vi.fn(async (file: string) => file),
    ...overrides,
  };
}

describe('useAssetOperations', () => {
  it('decrements pendingOpsRef when uploadAsset throws', async () => {
    const pendingOpsRef = { current: 0 };
    const provider = makeProvider({
      uploadAsset: vi.fn(async () => {
        throw new Error('upload failed');
      }),
    });
    const queryClient = new QueryClient();
    const { result } = renderHook(() => (
      useAssetOperations(provider, 'timeline-1', 'user-1', queryClient, pendingOpsRef)
    ));

    await expect(act(async () => {
      await result.current.uploadAsset(new File(['video'], 'clip.mp4', { type: 'video/mp4' }));
    })).rejects.toThrow('upload failed');

    expect(pendingOpsRef.current).toBe(0);
  });

  it('decrements pendingOpsRef when registerAsset throws', async () => {
    const pendingOpsRef = { current: 0 };
    const provider = makeProvider({
      registerAsset: vi.fn(async () => {
        throw new Error('register failed');
      }),
    });
    const queryClient = new QueryClient();
    const { result } = renderHook(() => (
      useAssetOperations(provider, 'timeline-1', 'user-1', queryClient, pendingOpsRef)
    ));

    await expect(act(async () => {
      await result.current.registerAsset('asset-1', { file: 'clip.mp4' });
    })).rejects.toThrow('register failed');

    expect(pendingOpsRef.current).toBe(0);
  });
});
