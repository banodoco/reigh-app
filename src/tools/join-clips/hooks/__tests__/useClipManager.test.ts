import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mock external dependencies
vi.mock('@/shared/components/ui/toast', () => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

// Mock dnd-kit (these hooks require DOM context)
vi.mock('@dnd-kit/core', () => ({
  useSensor: vi.fn().mockReturnValue({}),
  useSensors: vi.fn().mockReturnValue([]),
  MouseSensor: {},
  TouchSensor: {},
  KeyboardSensor: {},
}));

vi.mock('@dnd-kit/sortable', () => ({
  sortableKeyboardCoordinates: vi.fn(),
  arrayMove: (arr: unknown[], from: number, to: number) => {
    const result = [...arr];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  },
}));

// Mock the clip manager service
const mockGetCachedClipsCount = vi.fn().mockReturnValue(0);
const mockSetCachedClipsCount = vi.fn();
const mockPreloadPosterImages = vi.fn().mockResolvedValue([]);
const mockConsumePendingJoinClips = vi.fn().mockResolvedValue({
  ok: true,
  value: [],
  policy: 'best_effort',
  recoverable: false,
});
const mockApplyPendingClipActions = vi.fn((prev: unknown[]) => prev);
const mockBuildInitialClipsFromSettings = vi.fn().mockReturnValue({
  clips: [],
  transitionPrompts: [],
  posterUrlsToPreload: [],
});
const mockPadClipsWithEmptySlots = vi.fn((clips: unknown[]) => clips);
const mockCreateEmptyClip = vi.fn().mockImplementation(() => ({
  id: `empty-${Math.random().toString(36).slice(2)}`,
  url: '',
  loaded: false,
  playing: false,
}));
const mockBuildClipsToSave = vi.fn().mockReturnValue([]);
const mockBuildPromptsToSave = vi.fn().mockReturnValue([]);
const mockGetClipsNeedingDuration = vi.fn().mockReturnValue([]);
const mockLoadClipDuration = vi.fn();
const mockNormalizeClipSlots = vi.fn().mockReturnValue(null);
const mockUploadClipVideo = vi.fn();
const mockReorderClipsAndPrompts = vi.fn();
const mockUpdateClipInArray = vi.fn();
const mockClearClipVideo = vi.fn();

vi.mock('../../lib/clipManagerService', () => ({
  getCachedClipsCount: (...args: unknown[]) => mockGetCachedClipsCount(...args),
  setCachedClipsCount: (...args: unknown[]) => mockSetCachedClipsCount(...args),
  preloadPosterImages: (...args: unknown[]) => mockPreloadPosterImages(...args),
  consumePendingJoinClips: (...args: unknown[]) => mockConsumePendingJoinClips(...args),
  applyPendingClipActions: (...args: unknown[]) => mockApplyPendingClipActions(...args),
  buildInitialClipsFromSettings: (...args: unknown[]) => mockBuildInitialClipsFromSettings(...args),
  padClipsWithEmptySlots: (...args: unknown[]) => mockPadClipsWithEmptySlots(...args),
  createEmptyClip: (...args: unknown[]) => mockCreateEmptyClip(...args),
  buildClipsToSave: (...args: unknown[]) => mockBuildClipsToSave(...args),
  buildPromptsToSave: (...args: unknown[]) => mockBuildPromptsToSave(...args),
  getClipsNeedingDuration: (...args: unknown[]) => mockGetClipsNeedingDuration(...args),
  loadClipDuration: (...args: unknown[]) => mockLoadClipDuration(...args),
  normalizeClipSlots: (...args: unknown[]) => mockNormalizeClipSlots(...args),
  uploadClipVideo: (...args: unknown[]) => mockUploadClipVideo(...args),
  reorderClipsAndPrompts: (...args: unknown[]) => mockReorderClipsAndPrompts(...args),
  updateClipInArray: (...args: unknown[]) => mockUpdateClipInArray(...args),
  clearClipVideo: (...args: unknown[]) => mockClearClipVideo(...args),
}));

import { useClipManager } from '../useClipManager';

function createDefaultParams() {
  return {
    selectedProjectId: 'proj-1',
    joinSettings: {
      settings: {
        clips: [],
        transitionPrompts: [],
      },
      updateField: vi.fn(),
      updateFields: vi.fn(),
    } as unknown,
    settingsLoaded: true,
    loopFirstClip: false,
    createGenerationMutation: {
      mutateAsync: vi.fn().mockResolvedValue({}),
    } as unknown,
  };
}

function createMockVideoElement() {
  const addEventListener = vi.fn();
  const removeEventListener = vi.fn();
  const pause = vi.fn();
  const load = vi.fn();
  const video = {
    addEventListener,
    removeEventListener,
    pause,
    load,
    src: '',
  } as unknown as HTMLVideoElement;

  return {
    video,
    addEventListener,
    removeEventListener,
    pause,
  };
}

describe('useClipManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset createEmptyClip to provide unique IDs
    let counter = 0;
    mockCreateEmptyClip.mockImplementation(() => ({
      id: `empty-${counter++}`,
      url: '',
      loaded: false,
      playing: false,
    }));
  });

  it('returns initial state with empty clips', () => {
    const { result } = renderHook(() => useClipManager(createDefaultParams()));

    // Initial state from the hook
    expect(result.current.clips).toBeDefined();
    expect(result.current.transitionPrompts).toEqual([]);
    expect(result.current.uploadingClipId).toBeNull();
    expect(result.current.draggingOverClipId).toBeNull();
    expect(result.current.isScrolling).toBe(false);
    expect(result.current.lightboxClip).toBeNull();
    expect(result.current.isLoadingPersistedMedia).toBe(false);
  });

  it('initializes clips from settings when settingsLoaded', async () => {
    const initialClips = [
      { id: 'c1', url: 'https://example.com/v1.mp4', loaded: false, playing: false },
    ];
    mockBuildInitialClipsFromSettings.mockReturnValue({
      clips: initialClips,
      transitionPrompts: [],
      posterUrlsToPreload: [],
    });
    mockPadClipsWithEmptySlots.mockReturnValue([
      ...initialClips,
      { id: 'empty-0', url: '', loaded: false, playing: false },
    ]);

    const params = createDefaultParams();

    renderHook(() => useClipManager(params));

    await waitFor(() => {
      expect(mockBuildInitialClipsFromSettings).toHaveBeenCalledWith(params.joinSettings.settings);
    });
  });

  it('creates 2 empty clips when no initial clips from settings', async () => {
    mockBuildInitialClipsFromSettings.mockReturnValue({
      clips: [],
      transitionPrompts: [],
      posterUrlsToPreload: [],
    });

    renderHook(() => useClipManager(createDefaultParams()));

    await waitFor(() => {
      expect(mockCreateEmptyClip).toHaveBeenCalled();
    });
  });

  it('does not persist empty clips before initial hydration completes', async () => {
    let resolvePreload: (() => void) | null = null;
    mockPreloadPosterImages.mockImplementationOnce(
      () => new Promise<void[]>((resolve) => {
        resolvePreload = () => resolve([]);
      }),
    );
    mockBuildInitialClipsFromSettings.mockReturnValueOnce({
      clips: [
        { id: 'c1', url: 'https://example.com/v1.mp4', loaded: false, playing: false },
      ],
      transitionPrompts: [],
      posterUrlsToPreload: ['https://example.com/v1.jpg'],
    });
    mockPadClipsWithEmptySlots.mockReturnValueOnce([
      { id: 'c1', url: 'https://example.com/v1.mp4', loaded: false, playing: false },
      { id: 'empty-0', url: '', loaded: false, playing: false },
    ]);

    const params = createDefaultParams();
    params.joinSettings = {
      settings: {
        clips: [{ url: 'https://example.com/v1.mp4' }],
        transitionPrompts: [],
      },
      updateField: vi.fn(),
      updateFields: vi.fn(),
    } as unknown;

    renderHook(() => useClipManager(params));

    expect((params.joinSettings as { updateFields: ReturnType<typeof vi.fn> }).updateFields).not.toHaveBeenCalled();
    expect(resolvePreload).toBeTruthy();
    resolvePreload?.();

    await waitFor(() => {
      expect(mockPreloadPosterImages).toHaveBeenCalled();
    });
  });

  it('consumes pending join clips when settings are loaded', async () => {
    mockConsumePendingJoinClips.mockResolvedValue({
      ok: true,
      value: [
        {
          type: 'fill' as const,
          clip: { id: 'pending-1', url: 'https://example.com/pending.mp4', loaded: false, playing: false },
        },
      ],
      policy: 'best_effort',
      recoverable: false,
    });

    renderHook(() => useClipManager(createDefaultParams()));

    await waitFor(() => {
      expect(mockConsumePendingJoinClips).toHaveBeenCalledWith({ projectId: 'proj-1' });
    });
  });

  it('handleRemoveClip does not remove when only 2 clips', () => {
    const { result } = renderHook(() => useClipManager(createDefaultParams()));

    // Set up clips with exactly 2
    act(() => {
      result.current.setClips([
        { id: 'c1', url: 'url1', loaded: false, playing: false },
        { id: 'c2', url: 'url2', loaded: false, playing: false },
      ]);
    });

    act(() => {
      result.current.handleRemoveClip('c1');
    });

    // Should still have 2 clips (minimum enforced)
    expect(result.current.clips).toHaveLength(2);
  });

  it('handleRemoveClip removes clip when more than 2', () => {
    const { result } = renderHook(() => useClipManager(createDefaultParams()));

    act(() => {
      result.current.setClips([
        { id: 'c1', url: 'url1', loaded: false, playing: false },
        { id: 'c2', url: 'url2', loaded: false, playing: false },
        { id: 'c3', url: 'url3', loaded: false, playing: false },
      ]);
    });

    act(() => {
      result.current.handleRemoveClip('c2');
    });

    expect(result.current.clips).toHaveLength(2);
    expect(result.current.clips.find(c => c.id === 'c2')).toBeUndefined();
  });

  it('handlePromptChange adds new transition prompt', () => {
    const { result } = renderHook(() => useClipManager(createDefaultParams()));

    act(() => {
      result.current.handlePromptChange('c2', 'smooth transition');
    });

    expect(result.current.transitionPrompts).toContainEqual({
      id: 'c2',
      prompt: 'smooth transition',
    });
  });

  it('handlePromptChange updates existing transition prompt', () => {
    const { result } = renderHook(() => useClipManager(createDefaultParams()));

    act(() => {
      result.current.handlePromptChange('c2', 'first prompt');
    });

    act(() => {
      result.current.handlePromptChange('c2', 'updated prompt');
    });

    const prompts = result.current.transitionPrompts.filter(p => p.id === 'c2');
    expect(prompts).toHaveLength(1);
    expect(prompts[0].prompt).toBe('updated prompt');
  });

  it('setLightboxClip opens and closes lightbox', () => {
    const { result } = renderHook(() => useClipManager(createDefaultParams()));

    const clip = { id: 'c1', url: 'url1', loaded: false, playing: false };
    act(() => {
      result.current.setLightboxClip(clip);
    });

    expect(result.current.lightboxClip).toEqual(clip);

    act(() => {
      result.current.setLightboxClip(null);
    });

    expect(result.current.lightboxClip).toBeNull();
  });

  it('does not initialize clips before settingsLoaded', () => {
    const params = createDefaultParams();
    params.settingsLoaded = false;

    renderHook(() => useClipManager(params));

    expect(mockBuildInitialClipsFromSettings).not.toHaveBeenCalled();
  });

  it('does not initialize clips without selectedProjectId', () => {
    const params = createDefaultParams();
    params.selectedProjectId = null;

    renderHook(() => useClipManager(params));

    expect(mockBuildInitialClipsFromSettings).not.toHaveBeenCalled();
  });

  it('preloads poster images when initial clips have poster URLs', async () => {
    const initialClips = [
      { id: 'c1', url: 'https://example.com/v1.mp4', posterUrl: 'poster1.jpg', loaded: false, playing: false },
    ];
    mockBuildInitialClipsFromSettings.mockReturnValue({
      clips: initialClips,
      transitionPrompts: [],
      posterUrlsToPreload: ['poster1.jpg'],
    });
    mockPadClipsWithEmptySlots.mockReturnValue(initialClips);

    renderHook(() => useClipManager(createDefaultParams()));

    await waitFor(() => {
      expect(mockPreloadPosterImages).toHaveBeenCalledWith(
        ['poster1.jpg'],
        expect.any(Set),
      );
    });
  });

  it('ignores stale hydration preload completion after a project switch', async () => {
    let resolveProj1Preload: (() => void) | null = null;

    mockBuildInitialClipsFromSettings
      .mockReturnValueOnce({
        clips: [
          {
            id: 'proj1-clip',
            url: 'https://example.com/proj1.mp4',
            loaded: false,
            playing: false,
          },
        ],
        transitionPrompts: [],
        posterUrlsToPreload: ['proj1-poster.jpg'],
      })
      .mockReturnValueOnce({
        clips: [],
        transitionPrompts: [],
        posterUrlsToPreload: [],
      });

    mockPadClipsWithEmptySlots.mockImplementation((nextClips: unknown[]) => nextClips);
    mockPreloadPosterImages.mockImplementationOnce(
      () => new Promise<void[]>((resolve) => {
        resolveProj1Preload = () => resolve([]);
      }),
    );

    const params = createDefaultParams();
    const { result, rerender } = renderHook(
      ({ p }) => useClipManager(p),
      { initialProps: { p: params } },
    );

    await waitFor(() => {
      expect(mockPreloadPosterImages).toHaveBeenCalledTimes(1);
    });

    rerender({
      p: {
        ...params,
        selectedProjectId: 'proj-2',
      },
    });

    await waitFor(() => {
      expect(result.current.clips).toHaveLength(2);
      expect(result.current.clips.some(clip => clip.id === 'proj1-clip')).toBe(false);
    });

    expect(resolveProj1Preload).toBeTruthy();
    resolveProj1Preload?.();

    await waitFor(() => {
      expect(result.current.clips).toHaveLength(2);
      expect(result.current.clips.some(clip => clip.id === 'proj1-clip')).toBe(false);
    });
  });

  it('ignores stale pending-clip consumption after a project switch', async () => {
    let resolveProj1Consume: ((value: unknown) => void) | null = null;

    mockBuildInitialClipsFromSettings.mockReturnValue({
      clips: [],
      transitionPrompts: [],
      posterUrlsToPreload: [],
    });
    mockApplyPendingClipActions.mockImplementation((prev: unknown[], actions: unknown[]) => {
      const typedActions = actions as Array<{ clip: unknown }>;
      return [...prev, ...typedActions.map(action => action.clip)];
    });
    mockConsumePendingJoinClips
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveProj1Consume = resolve as (value: unknown) => void;
          }),
      )
      .mockResolvedValueOnce({
        ok: true,
        value: [
          {
            type: 'fill' as const,
            clip: {
              id: 'proj2-pending',
              url: 'https://example.com/proj2.mp4',
              loaded: false,
              playing: false,
            },
          },
        ],
        policy: 'best_effort',
        recoverable: false,
      });

    const params = createDefaultParams();
    const { result, rerender } = renderHook(
      ({ p }) => useClipManager(p),
      { initialProps: { p: params } },
    );

    await waitFor(() => {
      expect(mockConsumePendingJoinClips).toHaveBeenCalledWith({ projectId: 'proj-1' });
    });

    rerender({
      p: {
        ...params,
        selectedProjectId: 'proj-2',
      },
    });

    await waitFor(() => {
      expect(mockConsumePendingJoinClips).toHaveBeenCalledWith({ projectId: 'proj-2' });
      expect(result.current.clips.some(clip => clip.id === 'proj2-pending')).toBe(true);
    });

    expect(resolveProj1Consume).toBeTruthy();
    resolveProj1Consume?.({
      ok: true,
      value: [
        {
          type: 'fill' as const,
          clip: {
            id: 'proj1-stale',
            url: 'https://example.com/proj1-stale.mp4',
            loaded: false,
            playing: false,
          },
        },
      ],
      policy: 'best_effort',
      recoverable: false,
    });

    await waitFor(() => {
      expect(result.current.clips.some(clip => clip.id === 'proj1-stale')).toBe(false);
    });
  });

  it('resets state when project changes', () => {
    const params = createDefaultParams();
    const { rerender } = renderHook(
      ({ p }) => useClipManager(p),
      { initialProps: { p: params } },
    );

    const newParams = {
      ...params,
      selectedProjectId: 'proj-2',
    };

    rerender({ p: newParams });

    // After project change, the hook resets state.
    // The exact behavior depends on internal effects, but we verify
    // getCachedClipsCount is called with the new project
    expect(mockGetCachedClipsCount).toHaveBeenCalledWith('proj-2');
  });

  it('cleans up clip play listeners when clip set changes and on unmount', async () => {
    const { result, unmount } = renderHook(() => useClipManager(createDefaultParams()));

    const videoA = createMockVideoElement();
    const videoB = createMockVideoElement();
    const videoC = createMockVideoElement();

    act(() => {
      result.current.videoRefs.current.a = videoA.video;
      result.current.videoRefs.current.b = videoB.video;
      result.current.videoRefs.current.c = videoC.video;
      result.current.setClips([
        { id: 'a', url: 'a.mp4', loaded: false, playing: false },
        { id: 'b', url: 'b.mp4', loaded: false, playing: false },
      ]);
    });

    await waitFor(() => {
      expect(videoA.addEventListener).toHaveBeenCalledWith('play', expect.any(Function));
      expect(videoB.addEventListener).toHaveBeenCalledWith('play', expect.any(Function));
    });

    const listenerA = videoA.addEventListener.mock.calls[0][1];
    const listenerB = videoB.addEventListener.mock.calls[0][1];

    act(() => {
      result.current.setClips([
        { id: 'b', url: 'b.mp4', loaded: false, playing: false },
        { id: 'c', url: 'c.mp4', loaded: false, playing: false },
      ]);
    });

    await waitFor(() => {
      expect(videoA.removeEventListener).toHaveBeenCalledWith('play', listenerA);
      expect(videoB.removeEventListener).toHaveBeenCalledWith('play', listenerB);
      expect(videoC.addEventListener).toHaveBeenCalledWith('play', expect.any(Function));
    });

    const listenerBSecond = videoB.addEventListener.mock.calls[1][1];
    const listenerC = videoC.addEventListener.mock.calls[0][1];

    unmount();

    expect(videoB.removeEventListener).toHaveBeenCalledWith('play', listenerBSecond);
    expect(videoC.removeEventListener).toHaveBeenCalledWith('play', listenerC);
  });

  it('clears pending scroll timers when unmounted', () => {
    vi.useFakeTimers();
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const { unmount } = renderHook(() => useClipManager(createDefaultParams()));
    const scrollHandler = addEventListenerSpy.mock.calls.find(
      (call) => call[0] === 'scroll',
    )?.[1];

    expect(scrollHandler).toBeTypeOf('function');
    if (typeof scrollHandler === 'function') {
      act(() => {
        scrollHandler(new Event('scroll'));
      });
    }

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', scrollHandler);
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
    addEventListenerSpy.mockRestore();
    vi.useRealTimers();
  });
});
