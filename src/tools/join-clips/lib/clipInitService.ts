/**
 * Clip initialization and pending-clip consumption for the Join Clips tool.
 *
 * Extracted from clipManagerService to isolate:
 * - localStorage cache helpers (skeleton sizing)
 * - Poster preloading
 * - Video duration extraction from URLs
 * - Pending join clips (lightbox "Add to Join" localStorage polling)
 * - Building initial clips from persisted settings
 * - Padding clips with empty slots
 */

import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { generateUUID } from '@/shared/lib/taskCreation';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';
import type { VideoClip, TransitionPrompt } from '../types';
import type { JoinClipsSettings } from '@/shared/lib/joinClipsDefaults';

// ---------------------------------------------------------------------------
// Empty clip factory (canonical location — re-exported by clipManagerService)
// ---------------------------------------------------------------------------

export function createEmptyClip(): VideoClip {
  return { id: generateUUID(), url: '', loaded: false, playing: false };
}

// ---------------------------------------------------------------------------
// localStorage cache helpers (skeleton sizing)
// ---------------------------------------------------------------------------

function getLocalStorageKey(projectId: string): string {
  return `join-clips-count-${projectId}`;
}

const MAX_CACHED_CLIPS_COUNT = 500;

export function getCachedClipsCount(projectId: string | null): number {
  if (!projectId) return 0;
  try {
    const cached = localStorage.getItem(getLocalStorageKey(projectId));
    if (!cached) return 0;

    const parsed = Number.parseInt(cached, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_CACHED_CLIPS_COUNT) {
      normalizeAndPresentError(new Error('Invalid join-clips cached count'), {
        context: 'JoinClipsCache.read.invalid',
        showToast: false,
        logData: { projectId, cached },
      });
      return 0;
    }
    return parsed;
  } catch (error) {
    normalizeAndPresentError(error, {
      context: 'JoinClipsCache.read.error',
      showToast: false,
      logData: { projectId },
    });
    return 0;
  }
}

export function setCachedClipsCount(projectId: string | null, count: number): void {
  if (!projectId) return;
  try {
    const normalizedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    if (normalizedCount > 0) {
      localStorage.setItem(getLocalStorageKey(projectId), normalizedCount.toString());
    } else {
      localStorage.removeItem(getLocalStorageKey(projectId));
    }
  } catch (error) {
    normalizeAndPresentError(error, {
      context: 'JoinClipsCache.write.error',
      showToast: false,
      logData: { projectId, count },
    });
  }
}

// ---------------------------------------------------------------------------
// Poster preloading
// ---------------------------------------------------------------------------

/**
 * Warm the browser image cache for the given poster URLs.
 * Returns a promise that resolves when all images have loaded (or errored).
 */
export function preloadPosterImages(
  posterUrls: string[],
  alreadyPreloaded: Set<string>,
): Promise<void[]> {
  const promises = posterUrls
    .filter(url => url && !alreadyPreloaded.has(url))
    .map(
      url =>
        new Promise<void>(resolve => {
          const img = new Image();
          img.onload = () => {
            alreadyPreloaded.add(url);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = url;
        }),
    );
  return Promise.all(promises);
}

// ---------------------------------------------------------------------------
// Video duration extraction
// ---------------------------------------------------------------------------

/** Create a throwaway <video> to read duration from a URL. */
function getVideoDurationFromUrl(videoUrl: string): Promise<number> {
  return new Promise<number>(resolve => {
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.onloadedmetadata = () => resolve(videoElement.duration);
    videoElement.onerror = () => resolve(0);
    videoElement.src = videoUrl;
  });
}

// ---------------------------------------------------------------------------
// Pending join clips (lightbox "Add to Join" localStorage polling)
// ---------------------------------------------------------------------------

interface PendingJoinClipEntry {
  videoUrl: string;
  thumbnailUrl?: string;
  generationId: string;
  timestamp: number;
}

const PENDING_CLIPS_KEY = 'pendingJoinClips';
const PENDING_CLIPS_TTL_MS = 5 * 60 * 1000;

interface PendingJoinClipParseResult {
  entries: PendingJoinClipEntry[];
  invalidCount: number;
}

function parsePendingJoinClips(raw: string): PendingJoinClipParseResult | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const entries: PendingJoinClipEntry[] = [];
  let invalidCount = 0;
  for (const value of parsed) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      invalidCount += 1;
      continue;
    }

    const candidate = value as Record<string, unknown>;
    if (
      typeof candidate.videoUrl !== 'string'
      || typeof candidate.generationId !== 'string'
      || typeof candidate.timestamp !== 'number'
      || !Number.isFinite(candidate.timestamp)
    ) {
      invalidCount += 1;
      continue;
    }

    entries.push({
      videoUrl: candidate.videoUrl,
      generationId: candidate.generationId,
      timestamp: candidate.timestamp,
      ...(typeof candidate.thumbnailUrl === 'string' && candidate.thumbnailUrl.length > 0
        ? { thumbnailUrl: candidate.thumbnailUrl }
        : {}),
    });
  }

  return { entries, invalidCount };
}

/**
 * Reads and consumes pending join clips from localStorage.
 * Returns an array of new/updated clip data to merge into state.
 *
 * Each result item is either:
 * - `{ type: 'fill', clip }` -- fill the first empty slot
 * - `{ type: 'append', clip }` -- append as a new clip
 */
export interface PendingClipAction {
  clip: VideoClip;
}

export async function consumePendingJoinClips(
  readVideoDuration: (videoUrl: string) => Promise<number> = getVideoDurationFromUrl,
): Promise<OperationResult<PendingClipAction[]>> {
  try {
    const pendingData = localStorage.getItem(PENDING_CLIPS_KEY);
    if (!pendingData) return operationSuccess([]);

    const parsedPendingClips = parsePendingJoinClips(pendingData);
    if (!parsedPendingClips) {
      normalizeAndPresentError(new Error('Invalid pending join clips payload'), {
        context: 'JoinClipsPage.pendingClipsInvalid',
        showToast: false,
        logData: { key: PENDING_CLIPS_KEY },
      });
      localStorage.removeItem(PENDING_CLIPS_KEY);
      return operationFailure(new Error('Invalid pending join clips payload'), {
        policy: 'degrade',
        errorCode: 'pending_join_clips_invalid_payload',
        message: 'Invalid pending join clips payload',
        recoverable: true,
        cause: { key: PENDING_CLIPS_KEY },
      });
    }

    if (parsedPendingClips.invalidCount > 0) {
      normalizeAndPresentError(new Error('Dropped invalid pending join clip entries'), {
        context: 'JoinClipsPage.pendingClipsPartialRecovery',
        showToast: false,
        logData: {
          key: PENDING_CLIPS_KEY,
          totalEntries: parsedPendingClips.entries.length + parsedPendingClips.invalidCount,
          invalidEntries: parsedPendingClips.invalidCount,
        },
      });
    }

    const now = Date.now();
    const recentClips = parsedPendingClips.entries.filter(
      clip => now - clip.timestamp < PENDING_CLIPS_TTL_MS,
    );

    if (recentClips.length === 0) {
      localStorage.removeItem(PENDING_CLIPS_KEY);
      return operationSuccess([], {
        ...(parsedPendingClips.invalidCount > 0 ? { policy: 'degrade' } : {}),
      });
    }

    const actions: PendingClipAction[] = [];

    for (const { videoUrl, thumbnailUrl, generationId } of recentClips) {
      if (!videoUrl) continue;

      const durationSeconds = await readVideoDuration(videoUrl);

      const clip: VideoClip = {
        id: generateUUID(),
        url: videoUrl,
        posterUrl: thumbnailUrl,
        durationSeconds,
        loaded: false,
        playing: false,
        generationId,
      };

      actions.push({ clip });
    }

    localStorage.removeItem(PENDING_CLIPS_KEY);
    return operationSuccess(actions, {
      ...(parsedPendingClips.invalidCount > 0 ? { policy: 'degrade' } : {}),
    });
  } catch (error) {
    normalizeAndPresentError(error, { context: 'JoinClipsPage', showToast: false });
    return operationFailure(error, {
      policy: 'degrade',
      errorCode: 'pending_join_clips_read_failed',
      message: 'Failed to consume pending join clips',
      recoverable: true,
      cause: error,
    });
  }
}

/**
 * Apply pending clip actions to an existing clips array.
 * Reproduces the exact same merge logic from the original hook:
 * each action fills the first available empty slot, or appends.
 */
export function applyPendingClipActions(
  prevClips: VideoClip[],
  actions: PendingClipAction[],
): VideoClip[] {
  let clips = [...prevClips];
  // Track which indices have been filled by previous actions in this batch
  const filledIndices = new Set<number>();

  for (const action of actions) {
    const emptyIndex = clips.findIndex(
      (clip, idx) => !clip.url && !filledIndices.has(idx),
    );

    if (emptyIndex !== -1) {
      clips = clips.map((clip, idx) =>
        idx === emptyIndex
          ? {
              ...clip,
              url: action.clip.url,
              posterUrl: action.clip.posterUrl,
              durationSeconds: action.clip.durationSeconds,
              loaded: false,
              playing: false,
              generationId: action.clip.generationId,
            }
          : clip,
      );
      filledIndices.add(emptyIndex);
    } else {
      clips = [...clips, action.clip];
    }
  }

  return clips;
}

// ---------------------------------------------------------------------------
// Build initial clips from persisted settings
// ---------------------------------------------------------------------------

interface InitialClipsResult {
  clips: VideoClip[];
  transitionPrompts: TransitionPrompt[];
  posterUrlsToPreload: string[];
}

export function buildInitialClipsFromSettings(
  settings: JoinClipsSettings,
): InitialClipsResult {
  const initialClips: VideoClip[] = [];
  const posterUrlsToPreload: string[] = [];
  let transitionPrompts: TransitionPrompt[] = [];

  // Try loading from new multi-clip format
  if (settings.clips && settings.clips.length > 0) {
    settings.clips.forEach(clip => {
      if (clip.url) {
        initialClips.push({
          id: generateUUID(),
          url: clip.url,
          posterUrl: clip.posterUrl,
          finalFrameUrl: clip.finalFrameUrl,
          durationSeconds: clip.durationSeconds,
          loaded: false,
          playing: false,
        });
        if (clip.posterUrl) posterUrlsToPreload.push(clip.posterUrl);
      }
    });

    // Load transition prompts
    if (settings.transitionPrompts && settings.transitionPrompts.length > 0) {
      transitionPrompts = settings.transitionPrompts
        .map(tp => ({
          id: initialClips[tp.clipIndex]?.id || '',
          prompt: tp.prompt,
        }))
        .filter(p => p.id);
    }
  }
  // Fallback to legacy two-video format
  else if (settings.startingVideoUrl || settings.endingVideoUrl) {
    if (settings.startingVideoUrl) {
      initialClips.push({
        id: generateUUID(),
        url: settings.startingVideoUrl,
        posterUrl: settings.startingVideoPosterUrl,
        loaded: false,
        playing: false,
      });
      if (settings.startingVideoPosterUrl) {
        posterUrlsToPreload.push(settings.startingVideoPosterUrl);
      }
    }

    if (settings.endingVideoUrl) {
      initialClips.push({
        id: generateUUID(),
        url: settings.endingVideoUrl,
        posterUrl: settings.endingVideoPosterUrl,
        loaded: false,
        playing: false,
      });
      if (settings.endingVideoPosterUrl) {
        posterUrlsToPreload.push(settings.endingVideoPosterUrl);
      }
    }

    // Initialize transition prompts from legacy format
    // The `prompt` field existed in an older settings schema and may still
    // be present in persisted data even though it's not in the current type.
    const legacyPrompt = (settings as JoinClipsSettings & { prompt?: string }).prompt;
    if (initialClips.length >= 2 && legacyPrompt) {
      transitionPrompts = [
        {
          id: initialClips[1].id,
          prompt: legacyPrompt,
        },
      ];
    }
  }

  return { clips: initialClips, transitionPrompts, posterUrlsToPreload };
}

/**
 * Pad initialClips to have at least 2 slots plus one trailing empty slot.
 * This matches the original hook behavior exactly.
 */
export function padClipsWithEmptySlots(initialClips: VideoClip[]): VideoClip[] {
  if (initialClips.length === 0) {
    return [createEmptyClip(), createEmptyClip()];
  }

  if (initialClips.length < 2) {
    const clipsToAdd = 2 - initialClips.length;
    const emptyClips = Array.from({ length: clipsToAdd }, () => createEmptyClip());
    return [...initialClips, ...emptyClips];
  }

  // >= 2 clips: add one trailing empty slot
  return [...initialClips, createEmptyClip()];
}
