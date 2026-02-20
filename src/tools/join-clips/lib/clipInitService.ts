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

import { handleError } from '@/shared/lib/errorHandling/handleError';
import { generateUUID } from '@/shared/lib/taskCreation';
import type { VideoClip, TransitionPrompt } from '../types';
import type { JoinClipsSettings } from '../settings';

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

export function getCachedClipsCount(projectId: string | null): number {
  if (!projectId) return 0;
  try {
    const cached = localStorage.getItem(getLocalStorageKey(projectId));
    return cached ? parseInt(cached, 10) : 0;
  } catch {
    return 0;
  }
}

export function setCachedClipsCount(projectId: string | null, count: number): void {
  if (!projectId) return;
  try {
    if (count > 0) {
      localStorage.setItem(getLocalStorageKey(projectId), count.toString());
    } else {
      localStorage.removeItem(getLocalStorageKey(projectId));
    }
  } catch {
    // Ignore localStorage errors
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

/**
 * Reads and consumes pending join clips from localStorage.
 * Returns an array of new/updated clip data to merge into state.
 *
 * Each result item is either:
 * - `{ type: 'fill', clip }` -- fill the first empty slot
 * - `{ type: 'append', clip }` -- append as a new clip
 */
export interface PendingClipAction {
  type: 'fill' | 'append';
  clip: VideoClip;
}

export async function consumePendingJoinClips(): Promise<PendingClipAction[]> {
  try {
    const pendingData = localStorage.getItem(PENDING_CLIPS_KEY);
    if (!pendingData) return [];

    const pendingClips: PendingJoinClipEntry[] = JSON.parse(pendingData);
    const now = Date.now();
    const recentClips = pendingClips.filter(
      clip => now - clip.timestamp < PENDING_CLIPS_TTL_MS,
    );

    if (recentClips.length === 0) {
      localStorage.removeItem(PENDING_CLIPS_KEY);
      return [];
    }

    const actions: PendingClipAction[] = [];
    // Track how many empty slots we've "used" so far across iterations
    let filledCount = 0;

    for (const { videoUrl, thumbnailUrl, generationId } of recentClips) {
      if (!videoUrl) continue;

      const durationSeconds = await getVideoDurationFromUrl(videoUrl);

      const clip: VideoClip = {
        id: generateUUID(),
        url: videoUrl,
        posterUrl: thumbnailUrl,
        durationSeconds,
        loaded: false,
        playing: false,
        generationId,
      };

      // We'll mark as 'fill' and let the caller decide ordering
      // (the hook applies fills to first empty slot, then appends)
      actions.push({ type: filledCount === 0 ? 'fill' : 'append', clip });
      filledCount++;
    }

    localStorage.removeItem(PENDING_CLIPS_KEY);
    return actions;
  } catch (error) {
    handleError(error, { context: 'JoinClipsPage', showToast: false });
    return [];
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
