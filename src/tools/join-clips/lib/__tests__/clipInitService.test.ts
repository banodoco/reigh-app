import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/taskCreation', () => ({
  generateUUID: vi.fn().mockReturnValue('mock-uuid'),
}));

vi.mock('@/shared/lib/supabaseSession', () => ({
  readUserIdFromStorage: vi.fn().mockReturnValue('user-1'),
}));

import {
  createEmptyClip,
  getCachedClipsCount,
  setCachedClipsCount,
  preloadPosterImages,
  consumePendingJoinClips,
  applyPendingClipActions,
  buildInitialClipsFromSettings,
  padClipsWithEmptySlots,
  type PendingClipAction,
} from '../clipInitService';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { getPendingJoinClipsStorageKey } from '@/shared/lib/joinClipsPendingQueue';

describe('createEmptyClip', () => {
  it('creates an empty clip with default values', () => {
    const clip = createEmptyClip();
    expect(clip.id).toBe('mock-uuid');
    expect(clip.url).toBe('');
    expect(clip.loaded).toBe(false);
    expect(clip.playing).toBe(false);
  });
});

describe('getCachedClipsCount', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(normalizeAndPresentError).mockClear();
  });

  it('returns 0 for null projectId', () => {
    expect(getCachedClipsCount(null)).toBe(0);
  });

  it('returns 0 when no cached value', () => {
    expect(getCachedClipsCount('project-1')).toBe(0);
  });

  it('returns cached count', () => {
    localStorage.setItem('join-clips-count-project-1', '5');
    expect(getCachedClipsCount('project-1')).toBe(5);
  });

  it('returns 0 and logs when cached count is malformed', () => {
    localStorage.setItem('join-clips-count-project-1', 'not-a-number');
    expect(getCachedClipsCount('project-1')).toBe(0);
    expect(normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'JoinClipsCache.read.invalid' }),
    );
  });
});

describe('setCachedClipsCount', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does nothing for null projectId', () => {
    setCachedClipsCount(null, 5);
    expect(localStorage.length).toBe(0);
  });

  it('sets count in localStorage', () => {
    setCachedClipsCount('project-1', 3);
    expect(localStorage.getItem('join-clips-count-project-1')).toBe('3');
  });

  it('removes entry when count is 0', () => {
    localStorage.setItem('join-clips-count-project-1', '5');
    setCachedClipsCount('project-1', 0);
    expect(localStorage.getItem('join-clips-count-project-1')).toBeNull();
  });
});

describe('preloadPosterImages', () => {
  it('preloads URLs not already in the set', async () => {
    const alreadyPreloaded = new Set<string>();

    // Mock Image
    class TestImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      private _src = '';
      get src() { return this._src; }
      set src(value: string) {
        this._src = value;
        setTimeout(() => this.onload?.(), 0);
      }
    }
    // @ts-expect-error Test assigns a mocked Image constructor.
    globalThis.Image = TestImage;

    await preloadPosterImages(['https://example.com/poster.jpg'], alreadyPreloaded);

    expect(alreadyPreloaded.has('https://example.com/poster.jpg')).toBe(true);
  });

  it('skips already-preloaded URLs', async () => {
    const alreadyPreloaded = new Set(['https://example.com/poster.jpg']);

    const result = await preloadPosterImages(['https://example.com/poster.jpg'], alreadyPreloaded);

    // Should resolve immediately with no promises
    expect(result).toEqual([]);
  });

  it('skips empty URLs', async () => {
    const alreadyPreloaded = new Set<string>();
    const result = await preloadPosterImages(['', ''], alreadyPreloaded);
    expect(result).toEqual([]);
  });
});

describe('applyPendingClipActions', () => {
  it('fills empty slots first', () => {
    const prevClips = [
      { id: 'a', url: '', loaded: false, playing: false },
      { id: 'b', url: 'existing.mp4', loaded: false, playing: false },
    ];

    const actions: PendingClipAction[] = [
      {
        type: 'deferred_insert',
        clip: { id: 'new', url: 'new.mp4', loaded: false, playing: false },
      },
    ];

    const result = applyPendingClipActions(prevClips, actions);
    expect(result[0].url).toBe('new.mp4');
    expect(result[1].url).toBe('existing.mp4');
  });

  it('appends when no empty slots', () => {
    const prevClips = [
      { id: 'a', url: 'a.mp4', loaded: false, playing: false },
      { id: 'b', url: 'b.mp4', loaded: false, playing: false },
    ];

    const actions: PendingClipAction[] = [
      {
        type: 'deferred_insert',
        clip: { id: 'new', url: 'new.mp4', loaded: false, playing: false },
      },
    ];

    const result = applyPendingClipActions(prevClips, actions);
    expect(result).toHaveLength(3);
    expect(result[2].url).toBe('new.mp4');
  });

  it('handles multiple actions correctly', () => {
    const prevClips = [
      { id: 'a', url: '', loaded: false, playing: false },
      { id: 'b', url: '', loaded: false, playing: false },
    ];

    const actions: PendingClipAction[] = [
      { type: 'deferred_insert', clip: { id: 'c1', url: 'c1.mp4', loaded: false, playing: false } },
      { type: 'deferred_insert', clip: { id: 'c2', url: 'c2.mp4', loaded: false, playing: false } },
    ];

    const result = applyPendingClipActions(prevClips, actions);
    expect(result[0].url).toBe('c1.mp4');
    expect(result[1].url).toBe('c2.mp4');
  });
});

describe('consumePendingJoinClips', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(normalizeAndPresentError).mockClear();
  });

  it('returns empty array when no pending clips exist', async () => {
    const result = await consumePendingJoinClips();
    expect(result).toEqual({
      ok: true,
      value: [],
      policy: 'best_effort',
      recoverable: false,
    });
  });

  it('drops expired entries and clears storage', async () => {
    const now = Date.now();
    localStorage.setItem('pendingJoinClips', JSON.stringify([
      {
        videoUrl: 'https://example.com/old.mp4',
        generationId: 'old',
        timestamp: now - (6 * 60 * 1000),
      },
    ]));

    const result = await consumePendingJoinClips();
    expect(result).toEqual({
      ok: true,
      value: [],
      policy: 'best_effort',
      recoverable: false,
    });
    expect(localStorage.getItem('pendingJoinClips')).toBeNull();
  });

  it('maps recent pending clips and consumes storage', async () => {
    const now = Date.now();
    localStorage.setItem('pendingJoinClips', JSON.stringify([
      {
        videoUrl: 'https://example.com/a.mp4',
        thumbnailUrl: 'https://example.com/a.jpg',
        generationId: 'gen-a',
        timestamp: now,
      },
      {
        videoUrl: '',
        generationId: 'skip-empty',
        timestamp: now,
      },
    ]));

    const readVideoDuration = vi.fn().mockResolvedValue(12);
    const result = await consumePendingJoinClips({ readVideoDuration });

    expect(readVideoDuration).toHaveBeenCalledTimes(1);
    expect(readVideoDuration).toHaveBeenCalledWith('https://example.com/a.mp4');
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].type).toBe('deferred_insert');
    expect(result.value[0].clip.url).toBe('https://example.com/a.mp4');
    expect(result.value[0].clip.posterUrl).toBe('https://example.com/a.jpg');
    expect(result.value[0].clip.durationSeconds).toBe(12);
    expect(result.value[0].clip.generationId).toBe('gen-a');
    expect(localStorage.getItem('pendingJoinClips')).toBeNull();
  });

  it('consumes scoped queues for the active project only', async () => {
    const now = Date.now();
    const activeKey = getPendingJoinClipsStorageKey('project-1', 'user-1');
    const otherProjectKey = getPendingJoinClipsStorageKey('project-2', 'user-1');

    localStorage.setItem(activeKey, JSON.stringify([
      {
        videoUrl: 'https://example.com/a.mp4',
        generationId: 'gen-a',
        timestamp: now,
        projectId: 'project-1',
        userId: 'user-1',
      },
    ]));
    localStorage.setItem(otherProjectKey, JSON.stringify([
      {
        videoUrl: 'https://example.com/b.mp4',
        generationId: 'gen-b',
        timestamp: now,
        projectId: 'project-2',
        userId: 'user-1',
      },
    ]));

    const readVideoDuration = vi.fn().mockResolvedValue(9);
    const result = await consumePendingJoinClips({ projectId: 'project-1', readVideoDuration });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].type).toBe('deferred_insert');
    expect(result.value[0].clip.generationId).toBe('gen-a');
    expect(localStorage.getItem(activeKey)).toBeNull();
    expect(localStorage.getItem(otherProjectKey)).not.toBeNull();
  });

  it('clears malformed pending payloads and logs explicitly', async () => {
    localStorage.setItem('pendingJoinClips', '{"bad":"shape"}');

    const result = await consumePendingJoinClips();

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'pending_join_clips_invalid_payload',
      policy: 'degrade',
      recoverable: true,
    });
    expect(localStorage.getItem('pendingJoinClips')).toBeNull();
    expect(normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'JoinClipsPage.pendingClipsInvalid' }),
    );
  });
});

describe('buildInitialClipsFromSettings', () => {
  it('builds clips from multi-clip format', () => {
    const settings = {
      clips: [
        { url: 'clip1.mp4', posterUrl: 'poster1.jpg', durationSeconds: 5 },
        { url: 'clip2.mp4', posterUrl: 'poster2.jpg' },
      ],
      transitionPrompts: [{ clipIndex: 1, prompt: 'transition prompt' }],
    } as unknown;

    const result = buildInitialClipsFromSettings(settings);

    expect(result.clips).toHaveLength(2);
    expect(result.clips[0].url).toBe('clip1.mp4');
    expect(result.posterUrlsToPreload).toContain('poster1.jpg');
    expect(result.transitionPrompts).toHaveLength(1);
  });

  it('builds clips from legacy two-video format', () => {
    const settings = {
      startingVideoUrl: 'start.mp4',
      startingVideoPosterUrl: 'start-poster.jpg',
      endingVideoUrl: 'end.mp4',
      endingVideoPosterUrl: 'end-poster.jpg',
      clips: [],
    } as unknown;

    const result = buildInitialClipsFromSettings(settings);

    expect(result.clips).toHaveLength(2);
    expect(result.clips[0].url).toBe('start.mp4');
    expect(result.clips[1].url).toBe('end.mp4');
    expect(result.posterUrlsToPreload).toHaveLength(2);
  });

  it('returns empty arrays for settings with no clips', () => {
    const settings = { clips: [] } as unknown;
    const result = buildInitialClipsFromSettings(settings);
    expect(result.clips).toHaveLength(0);
    expect(result.transitionPrompts).toHaveLength(0);
  });

  it('builds legacy transition prompts', () => {
    const settings = {
      startingVideoUrl: 'start.mp4',
      endingVideoUrl: 'end.mp4',
      prompt: 'smooth transition',
      clips: [],
    } as unknown;

    const result = buildInitialClipsFromSettings(settings);
    expect(result.transitionPrompts).toHaveLength(1);
    expect(result.transitionPrompts[0].prompt).toBe('smooth transition');
  });
});

describe('padClipsWithEmptySlots', () => {
  it('returns 2 empty clips for empty input', () => {
    const result = padClipsWithEmptySlots([]);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('');
    expect(result[1].url).toBe('');
  });

  it('pads single clip to 2', () => {
    const clips = [{ id: '1', url: 'a.mp4', loaded: false, playing: false }];
    const result = padClipsWithEmptySlots(clips);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('a.mp4');
    expect(result[1].url).toBe('');
  });

  it('adds trailing empty slot for 2+ clips', () => {
    const clips = [
      { id: '1', url: 'a.mp4', loaded: false, playing: false },
      { id: '2', url: 'b.mp4', loaded: false, playing: false },
    ];
    const result = padClipsWithEmptySlots(clips);
    expect(result).toHaveLength(3);
    expect(result[2].url).toBe('');
  });

  it('adds trailing empty slot for 3+ clips', () => {
    const clips = [
      { id: '1', url: 'a.mp4', loaded: false, playing: false },
      { id: '2', url: 'b.mp4', loaded: false, playing: false },
      { id: '3', url: 'c.mp4', loaded: false, playing: false },
    ];
    const result = padClipsWithEmptySlots(clips);
    expect(result).toHaveLength(4);
  });
});
