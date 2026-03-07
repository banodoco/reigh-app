import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPendingClipActions, consumePendingJoinClips } from '../clipPendingActions';
import { getPendingJoinClipsStorageKey } from '@/shared/lib/joinClipsPendingQueue';
import { _clearJoinClipsIntentsForTesting, enqueueJoinClipsIntent } from '@/shared/lib/joinClipsIntentStore';
import type { VideoClip } from '../../types';

const normalizeAndPresentErrorMock = vi.hoisted(() => vi.fn());
const generateUUIDMock = vi.hoisted(() => vi.fn());

interface MockPendingJoinClipEntry {
  videoUrl: string;
  thumbnailUrl?: string;
  generationId: string;
  timestamp: number;
  projectId?: string;
  userId?: string;
}

const joinClipsQueueMock = vi.hoisted(() => {
  const LEGACY_KEY = 'pendingJoinClips';
  const PREFIX = 'pendingJoinClips';
  const normalize = (value: string | null | undefined): string | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  };

  const getKey = (projectId: string | null | undefined, userId?: string | null): string => {
    const normalizedProjectId = normalize(projectId);
    if (!normalizedProjectId) {
      return LEGACY_KEY;
    }
    const normalizedUserId = normalize(userId) ?? 'anonymous';
    return `${PREFIX}:${normalizedProjectId}:${normalizedUserId}`;
  };

  return {
    getPendingJoinClipsStorageKey: getKey,
    getPendingJoinClipsCandidateKeys: ({ projectId, userId }: { projectId?: string | null; userId?: string | null }) => {
      const scoped = getKey(projectId, userId);
      return scoped === LEGACY_KEY ? [LEGACY_KEY] : [scoped, LEGACY_KEY];
    },
    isPendingJoinClipInScope: (
      entry: MockPendingJoinClipEntry,
      scope: { projectId?: string | null; userId?: string | null },
    ) => {
      const scopeProjectId = normalize(scope.projectId);
      if (scopeProjectId) {
        const entryProjectId = normalize(entry.projectId);
        if (entryProjectId && entryProjectId !== scopeProjectId) {
          return false;
        }
      }

      const scopeUserId = normalize(scope.userId);
      if (scopeUserId) {
        const entryUserId = normalize(entry.userId);
        if (entryUserId && entryUserId !== scopeUserId) {
          return false;
        }
      }

      return true;
    },
  };
});

const joinClipsIntentStoreMock = vi.hoisted(() => {
  const intentsByScopeKey = new Map<string, MockPendingJoinClipEntry[]>();

  const getScopeKey = (scope: { projectId?: string | null; userId?: string | null }) =>
    joinClipsQueueMock.getPendingJoinClipsStorageKey(scope.projectId, scope.userId);

  return {
    enqueueJoinClipsIntent: (
      entry: MockPendingJoinClipEntry,
      scope: { projectId?: string | null; userId?: string | null },
    ) => {
      const key = getScopeKey(scope);
      const existing = intentsByScopeKey.get(key) ?? [];
      intentsByScopeKey.set(key, [...existing, entry]);
    },
    consumeJoinClipsIntents: (scope: { projectId?: string | null; userId?: string | null }) => {
      const candidateKeys = joinClipsQueueMock.getPendingJoinClipsCandidateKeys(scope);
      for (const key of candidateKeys) {
        const pending = intentsByScopeKey.get(key);
        if (!pending || pending.length === 0) {
          continue;
        }
        intentsByScopeKey.delete(key);
        return pending;
      }
      return [];
    },
    _clearJoinClipsIntentsForTesting: () => {
      intentsByScopeKey.clear();
    },
  };
});

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => normalizeAndPresentErrorMock(...args),
}));

vi.mock('@/shared/lib/joinClipsPendingQueue', () => joinClipsQueueMock);

vi.mock('@/shared/lib/joinClipsIntentStore', () => joinClipsIntentStoreMock);

vi.mock('@/shared/lib/taskCreation', () => ({
  generateUUID: (...args: unknown[]) => generateUUIDMock(...args),
}));

vi.mock('@/shared/lib/supabaseSession', () => ({
  readUserIdFromStorage: () => 'user-1',
}));

vi.mock('@/shared/lib/operationResult', () => ({
  operationSuccess: (value: unknown, options?: { policy?: string }) => ({
    ok: true,
    value,
    policy: options?.policy ?? 'best_effort',
    recoverable: false,
  }),
  operationFailure: (error: unknown, options?: { errorCode?: string; policy?: string; message?: string; recoverable?: boolean; cause?: unknown }) => ({
    ok: false,
    error: error instanceof Error ? error : new Error(String(error)),
    errorCode: options?.errorCode ?? 'operation_failed',
    policy: options?.policy ?? 'best_effort',
    message: options?.message ?? (error instanceof Error ? error.message : String(error)),
    recoverable: options?.recoverable ?? true,
    cause: options?.cause,
  }),
}));

function createClip(overrides: Partial<VideoClip> = {}): VideoClip {
  return {
    id: overrides.id ?? 'clip-id',
    url: overrides.url ?? '',
    posterUrl: overrides.posterUrl,
    durationSeconds: overrides.durationSeconds,
    loaded: overrides.loaded ?? false,
    playing: overrides.playing ?? false,
    generationId: overrides.generationId,
  };
}

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe('clipPendingActions', () => {
  const localStorageMock = createLocalStorageMock();

  // The test runner for this suite uses a node environment.
  vi.stubGlobal('localStorage', localStorageMock);

  beforeEach(() => {
    localStorage.clear();
    _clearJoinClipsIntentsForTesting();
    normalizeAndPresentErrorMock.mockReset();
    generateUUIDMock.mockReset();
    generateUUIDMock.mockImplementation(() => 'generated-id');
  });

  it('returns failure and removes storage key for malformed pending payload', async () => {
    const key = getPendingJoinClipsStorageKey('project-1', 'user-1');
    localStorage.setItem(key, '{not-json');

    const result = await consumePendingJoinClips({ projectId: 'project-1' });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected consumePendingJoinClips to fail');
    }
    expect(result.errorCode).toBe('pending_join_clips_invalid_payload');
    expect(localStorage.getItem(key)).toBeNull();
    expect(normalizeAndPresentErrorMock).toHaveBeenCalled();
  });

  it('drops invalid entries, returns degraded success, and builds clip actions from valid entries', async () => {
    const key = getPendingJoinClipsStorageKey('project-1', 'user-1');
    const now = Date.now();
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          videoUrl: 'https://cdn.example.com/a.mp4',
          thumbnailUrl: 'https://cdn.example.com/a.png',
          generationId: 'gen-a',
          timestamp: now,
          projectId: 'project-1',
          userId: 'user-1',
        },
        {
          videoUrl: 123,
          generationId: 'invalid',
          timestamp: now,
        },
      ]),
    );

    const result = await consumePendingJoinClips({
      projectId: 'project-1',
      readVideoDuration: async () => 12.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected consumePendingJoinClips to succeed');
    }
    expect(result.policy).toBe('degrade');
    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toEqual({
      type: 'deferred_insert',
      clip: {
        id: 'generated-id',
        url: 'https://cdn.example.com/a.mp4',
        posterUrl: 'https://cdn.example.com/a.png',
        durationSeconds: 12.5,
        loaded: false,
        playing: false,
        generationId: 'gen-a',
      },
    });
    expect(localStorage.getItem(key)).toBeNull();
    expect(normalizeAndPresentErrorMock).toHaveBeenCalled();
  });

  it('prefers in-memory intents and clears scoped storage key after consumption', async () => {
    const key = getPendingJoinClipsStorageKey('project-1', 'user-1');
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          videoUrl: 'https://cdn.example.com/storage.mp4',
          generationId: 'gen-storage',
          timestamp: Date.now(),
        },
      ]),
    );

    enqueueJoinClipsIntent(
      {
        videoUrl: 'https://cdn.example.com/memory.mp4',
        generationId: 'gen-memory',
        timestamp: Date.now(),
        projectId: 'project-1',
        userId: 'user-1',
      },
      { projectId: 'project-1', userId: 'user-1' },
    );

    const result = await consumePendingJoinClips({
      projectId: 'project-1',
      readVideoDuration: async () => 7,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected consumePendingJoinClips to succeed');
    }
    expect(result.value).toHaveLength(1);
    expect(result.value[0].clip.url).toBe('https://cdn.example.com/memory.mp4');
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('returns empty success when only expired/scoped-out entries remain', async () => {
    const key = getPendingJoinClipsStorageKey('project-1', 'user-1');
    localStorage.setItem(
      key,
      JSON.stringify([
        {
          videoUrl: 'https://cdn.example.com/expired.mp4',
          generationId: 'gen-expired',
          timestamp: Date.now() - 6 * 60 * 1000,
          projectId: 'project-1',
          userId: 'user-1',
        },
        {
          videoUrl: 'https://cdn.example.com/other-project.mp4',
          generationId: 'gen-other-project',
          timestamp: Date.now(),
          projectId: 'project-2',
          userId: 'user-1',
        },
      ]),
    );

    const result = await consumePendingJoinClips({ projectId: 'project-1' });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected consumePendingJoinClips to succeed');
    }
    expect(result.value).toEqual([]);
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('fills first empty slot before appending remaining pending clips', () => {
    const existing = [
      createClip({ id: 'slot-0', url: '' }),
      createClip({ id: 'slot-1', url: 'https://cdn.example.com/existing.mp4' }),
    ];

    const actions = [
      {
        type: 'deferred_insert' as const,
        clip: createClip({
          id: 'pending-1',
          url: 'https://cdn.example.com/pending-1.mp4',
          posterUrl: 'https://cdn.example.com/pending-1.png',
          durationSeconds: 3,
          loaded: true,
          playing: true,
          generationId: 'gen-1',
        }),
      },
      {
        type: 'deferred_insert' as const,
        clip: createClip({
          id: 'pending-2',
          url: 'https://cdn.example.com/pending-2.mp4',
          durationSeconds: 4,
          generationId: 'gen-2',
          loaded: true,
          playing: true,
        }),
      },
    ];

    const updated = applyPendingClipActions(existing, actions);

    expect(updated).toHaveLength(3);
    expect(updated[0]).toMatchObject({
      id: 'slot-0',
      url: 'https://cdn.example.com/pending-1.mp4',
      posterUrl: 'https://cdn.example.com/pending-1.png',
      durationSeconds: 3,
      loaded: false,
      playing: false,
      generationId: 'gen-1',
    });
    expect(updated[1].url).toBe('https://cdn.example.com/existing.mp4');
    expect(updated[2]).toEqual(actions[1].clip);
  });
});
