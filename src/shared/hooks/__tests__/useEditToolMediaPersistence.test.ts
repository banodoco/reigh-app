import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        })),
      })),
    })),
  },
}));

const mockUpdate = vi.fn();
vi.mock('@/shared/hooks/useToolSettings', () => ({
  useToolSettings: vi.fn(() => ({
    settings: undefined,
    update: mockUpdate,
    isLoading: false,
  })),
}));

import { useEditToolMediaPersistence } from '../useEditToolMediaPersistence';

describe('useEditToolMediaPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdate.mockResolvedValue(undefined);
  });

  it('returns initial state with no selected media', () => {
    const { result } = renderHook(() =>
      useEditToolMediaPersistence({
        settingsToolId: 'edit-images-ui',
        projectId: 'proj-1',
      })
    );

    expect(result.current.selectedMedia).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.showSkeleton).toBe(false);
  });

  it('setSelectedMedia updates state', () => {
    const { result } = renderHook(() =>
      useEditToolMediaPersistence({
        settingsToolId: 'edit-images-ui',
        projectId: 'proj-1',
      })
    );

    const mockMedia = { id: 'gen-1', location: 'test.jpg' } as unknown;
    act(() => {
      result.current.setSelectedMedia(mockMedia);
    });

    expect(result.current.selectedMedia).toEqual(mockMedia);
  });

  it('handleEditorClose clears media', () => {
    const { result } = renderHook(() =>
      useEditToolMediaPersistence({
        settingsToolId: 'edit-images-ui',
        projectId: 'proj-1',
      })
    );

    const mockMedia = { id: 'gen-1', location: 'test.jpg' } as unknown;
    act(() => {
      result.current.setSelectedMedia(mockMedia);
    });

    act(() => {
      result.current.handleEditorClose();
    });

    expect(result.current.selectedMedia).toBeNull();
  });

  it('exposes userClosedEditor ref', () => {
    const { result } = renderHook(() =>
      useEditToolMediaPersistence({
        settingsToolId: 'edit-images-ui',
        projectId: 'proj-1',
      })
    );

    expect(result.current.userClosedEditor.current).toBe(false);

    act(() => {
      result.current.handleEditorClose();
    });

    expect(result.current.userClosedEditor.current).toBe(true);
  });
});
