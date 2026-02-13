import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockUseAutoSaveSettings = vi.fn();

vi.mock('@/shared/hooks/useAutoSaveSettings', () => ({
  useAutoSaveSettings: (...args: unknown[]) => mockUseAutoSaveSettings(...args),
}));

vi.mock('@/shared/lib/toolConstants', () => ({
  TOOL_IDS: {
    JOIN_CLIPS: 'join_clips',
  },
}));

vi.mock('../settings', () => ({
  joinClipsSettings: {
    defaults: {
      contextFrameCount: 15,
      gapFrameCount: 23,
      replaceMode: true,
      keepBridgingImages: false,
      prompt: '',
      negativePrompt: '',
    },
  },
}));

import { useJoinClipsSettings } from '../useJoinClipsSettings';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useJoinClipsSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAutoSaveSettings.mockReturnValue({
      settings: { contextFrameCount: 15 },
      status: 'ready',
      updateField: vi.fn(),
      updateFields: vi.fn(),
    });
  });

  it('calls useAutoSaveSettings with correct params', () => {
    renderHook(() => useJoinClipsSettings('proj-1'), { wrapper: createWrapper() });

    expect(mockUseAutoSaveSettings).toHaveBeenCalledWith({
      toolId: 'join_clips',
      scope: 'project',
      projectId: 'proj-1',
      defaults: expect.objectContaining({
        contextFrameCount: 15,
        gapFrameCount: 23,
        replaceMode: true,
      }),
      enabled: true,
      debug: false,
      debugTag: '[JoinClips]',
    });
  });

  it('disables when projectId is null', () => {
    renderHook(() => useJoinClipsSettings(null), { wrapper: createWrapper() });

    expect(mockUseAutoSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
        projectId: null,
      }),
    );
  });

  it('disables when projectId is undefined', () => {
    renderHook(() => useJoinClipsSettings(undefined), { wrapper: createWrapper() });

    expect(mockUseAutoSaveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
  });

  it('returns the result from useAutoSaveSettings', () => {
    const mockReturn = {
      settings: { contextFrameCount: 20, gapFrameCount: 10 },
      status: 'ready',
      updateField: vi.fn(),
      updateFields: vi.fn(),
    };
    mockUseAutoSaveSettings.mockReturnValue(mockReturn);

    const { result } = renderHook(() => useJoinClipsSettings('proj-1'), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBe(mockReturn);
  });
});
