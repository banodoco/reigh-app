// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  useToolSettings: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
}));

vi.mock('@/shared/hooks/settings/useToolSettings', () => ({
  useToolSettings: (...args: unknown[]) => mocks.useToolSettings(...args),
}));

import { useEditToolMediaPersistence } from './useEditToolMediaPersistence';

let toolSettingsState: {
  settings: Record<string, unknown> | undefined;
  update: ReturnType<typeof vi.fn>;
  isLoading: boolean;
};

describe('useEditToolMediaPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const update = vi.fn().mockResolvedValue(undefined);
    toolSettingsState = {
      settings: undefined,
      update,
      isLoading: false,
    };

    mocks.useToolSettings.mockImplementation(() => toolSettingsState);

    const queryBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    };

    mocks.getSupabaseClient.mockReturnValue({
      from: vi.fn(() => queryBuilder),
    });
  });

  it('hydrates selected media from persisted settings and runs preload callbacks', async () => {
    const preloadMedia = vi.fn();
    const onSettingsLoaded = vi.fn();
    const generation = { id: 'gen-1', location: 'image.png' };

    toolSettingsState.settings = {
      lastEditedMediaId: 'gen-1',
      restored: 'yes',
    };

    const supabase = mocks.getSupabaseClient.mock.results[0]?.value ?? mocks.getSupabaseClient();
    const queryBuilder = supabase.from();
    queryBuilder.single.mockResolvedValueOnce({ data: generation, error: null });

    const { result } = renderHook(() =>
      useEditToolMediaPersistence({
        settingsToolId: 'edit-images-ui',
        projectId: 'project-1',
        preloadMedia,
        onSettingsLoaded,
      }),
    );

    await waitFor(() => {
      expect(result.current.selectedMedia?.id).toBe('gen-1');
    });

    expect(preloadMedia).toHaveBeenCalledWith(generation);
    expect(onSettingsLoaded).toHaveBeenCalledWith(toolSettingsState.settings);
  });

  it('clears invalid persisted media ids when the lookup fails', async () => {
    toolSettingsState.settings = {
      lastEditedMediaId: 'missing-media',
    };

    const supabase = mocks.getSupabaseClient.mock.results[0]?.value ?? mocks.getSupabaseClient();
    const queryBuilder = supabase.from();
    queryBuilder.single.mockResolvedValueOnce({
      data: null,
      error: { message: 'not found' },
    });

    renderHook(() =>
      useEditToolMediaPersistence({
        settingsToolId: 'edit-video-ui',
        projectId: 'project-1',
        extraClearData: { lastEditedMediaSegments: null },
      }),
    );

    await waitFor(() => {
      expect(toolSettingsState.update).toHaveBeenCalledWith('project', {
        lastEditedMediaId: null,
        lastEditedMediaSegments: null,
      });
    });
  });

  it('persists manual selections and clears them after an explicit close', async () => {
    const { result, rerender } = renderHook(() =>
      useEditToolMediaPersistence({
        settingsToolId: 'edit-images-ui',
        projectId: 'project-1',
        extraClearData: { lastEditedMediaSegments: null },
      }),
    );

    act(() => {
      result.current.setSelectedMedia({ id: 'gen-2' } as never);
    });

    await waitFor(() => {
      expect(toolSettingsState.update).toHaveBeenCalledWith('project', {
        lastEditedMediaId: 'gen-2',
      });
    });

    toolSettingsState.update.mockClear();
    toolSettingsState.settings = { lastEditedMediaId: 'gen-2' };

    rerender();

    act(() => {
      result.current.handleEditorClose();
    });

    await waitFor(() => {
      expect(toolSettingsState.update).toHaveBeenCalledWith('project', {
        lastEditedMediaId: null,
        lastEditedMediaSegments: null,
      });
    });
  });
});
