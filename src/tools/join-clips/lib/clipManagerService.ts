/**
 * Pure business logic for clip management in the Join Clips tool.
 *
 * This service layer extracts non-React logic from useClipManager so the hook
 * remains a thin reactive wrapper.  Every function here is side-effect-free
 * with respect to React state (callers pass data in, get data out).
 *
 * Initialization, pending-clip consumption, localStorage caching, and poster
 * preloading live in clipInitService.ts (same directory).
 */

import { extractVideoMetadataFromUrl } from '@/shared/lib/videoUploader';
import { uploadVideoToStorage } from '@/shared/lib/videoUploader';
import { uploadBlobToStorage } from '@/shared/lib/imageUploader';
import { extractVideoPosterFrame, extractVideoFinalFrame } from '@/shared/utils/videoPosterExtractor';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { arrayMove } from '@dnd-kit/sortable';
import type { VideoClip, TransitionPrompt } from '../types';

// Re-export everything from clipInitService so existing consumers keep working
export {
  getCachedClipsCount,
  setCachedClipsCount,
  preloadPosterImages,
  consumePendingJoinClips,
  applyPendingClipActions,
  buildInitialClipsFromSettings,
  padClipsWithEmptySlots,
  createEmptyClip,
} from './clipInitService';

export type { PendingClipAction } from './clipInitService';

// Import createEmptyClip locally for use within this module
import { createEmptyClip } from './clipInitService';

// ---------------------------------------------------------------------------
// Persistence serialization
// ---------------------------------------------------------------------------

export function buildClipsToSave(
  clips: VideoClip[],
): Array<{ url: string; posterUrl?: string; finalFrameUrl?: string; durationSeconds?: number }> {
  return clips
    .filter(clip => clip.url)
    .map(clip => ({
      url: clip.url,
      posterUrl: clip.posterUrl,
      finalFrameUrl: clip.finalFrameUrl,
      durationSeconds: clip.durationSeconds,
    }));
}

export function buildPromptsToSave(
  clips: VideoClip[],
  transitionPrompts: TransitionPrompt[],
): Array<{ clipIndex: number; prompt: string }> {
  return transitionPrompts
    .map(tp => {
      const clipIndex = clips.findIndex(c => c.id === tp.id);
      if (clipIndex > 0 && tp.prompt) {
        return { clipIndex, prompt: tp.prompt };
      }
      return null;
    })
    .filter((p): p is { clipIndex: number; prompt: string } => p !== null);
}

// ---------------------------------------------------------------------------
// Lazy-load metadata for clips missing duration
// ---------------------------------------------------------------------------

export function getClipsNeedingDuration(clips: VideoClip[]): VideoClip[] {
  return clips.filter(
    clip => clip.url && clip.durationSeconds === undefined && !clip.metadataLoading,
  );
}

export async function loadClipDuration(
  clip: VideoClip,
): Promise<{ id: string; durationSeconds: number }> {
  try {
    const metadata = await extractVideoMetadataFromUrl(clip.url);
    return { id: clip.id, durationSeconds: metadata.duration_seconds };
  } catch (error) {
    handleError(error, {
      context: 'JoinClipsPage',
      showToast: false,
      logData: { clipId: clip.id },
    });
    return { id: clip.id, durationSeconds: 0 };
  }
}

// ---------------------------------------------------------------------------
// Ensure minimum clips / auto-add / trim trailing empties
// ---------------------------------------------------------------------------

interface ClipNormalizationResult {
  clips: VideoClip[];
  removedClipIds: string[];
}

/**
 * Normalize the clips array:
 * - Ensure minimum 2 clips
 * - Auto-add empty slot when all slots are filled
 * - Remove extra trailing empties (keep exactly 1 trailing empty)
 *
 * Returns null if no changes are needed.
 */
export function normalizeClipSlots(clips: VideoClip[]): ClipNormalizationResult | null {
  if (clips.length === 0) return null;

  // Ensure minimum of 2
  if (clips.length < 2) {
    const clipsToAdd = 2 - clips.length;
    const newClips = Array.from({ length: clipsToAdd }, () => createEmptyClip());
    return { clips: [...clips, ...newClips], removedClipIds: [] };
  }

  // Auto-add empty slot when all filled
  if (clips.every(clip => clip.url)) {
    return {
      clips: [...clips, createEmptyClip()],
      removedClipIds: [],
    };
  }

  // Find last non-empty clip
  let lastNonEmptyIndex = -1;
  for (let i = clips.length - 1; i >= 0; i--) {
    if (clips[i].url) {
      lastNonEmptyIndex = i;
      break;
    }
  }

  const trailingEmptyCount = clips.length - lastNonEmptyIndex - 1;

  if (trailingEmptyCount > 1) {
    const targetLength = Math.max(2, lastNonEmptyIndex + 2);
    if (clips.length !== targetLength) {
      const removedClipIds = clips.slice(targetLength).map(c => c.id);
      return { clips: clips.slice(0, targetLength), removedClipIds };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Video duration extraction (from File)
// ---------------------------------------------------------------------------

/** Create a throwaway <video> to read duration from a File (revokes the object URL). */
function getVideoDurationFromFile(file: File): Promise<number> {
  return new Promise<number>(resolve => {
    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.onloadedmetadata = () => {
      resolve(videoElement.duration);
      URL.revokeObjectURL(videoElement.src);
    };
    videoElement.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(videoElement.src);
    };
    videoElement.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------------------
// Video file upload
// ---------------------------------------------------------------------------

interface UploadVideoResult {
  videoUrl: string;
  posterUrl: string;
  finalFrameUrl: string;
  durationSeconds: number;
}

export async function uploadClipVideo(
  file: File,
  projectId: string,
  clipId: string,
): Promise<UploadVideoResult> {
  const [posterBlob, finalFrameBlob, durationSeconds] = await Promise.all([
    extractVideoPosterFrame(file),
    extractVideoFinalFrame(file),
    getVideoDurationFromFile(file),
  ]);

  const [videoUrl, posterUrl, finalFrameUrl] = await Promise.all([
    uploadVideoToStorage(file, projectId, clipId, {
      maxRetries: 3,
      timeoutMs: 300000,
    }),
    uploadBlobToStorage(posterBlob, 'poster.jpg', 'image/jpeg', {
      maxRetries: 2,
      timeoutMs: 30000,
    }),
    uploadBlobToStorage(finalFrameBlob, 'final-frame.jpg', 'image/jpeg', {
      maxRetries: 2,
      timeoutMs: 30000,
    }),
  ]);

  return { videoUrl, posterUrl, finalFrameUrl, durationSeconds };
}

// ---------------------------------------------------------------------------
// Drag-end reorder
// ---------------------------------------------------------------------------

interface ReorderResult {
  clips: VideoClip[];
  transitionPrompts: TransitionPrompt[];
}

export function reorderClipsAndPrompts(
  clips: VideoClip[],
  transitionPrompts: TransitionPrompt[],
  activeId: string | number,
  overId: string | number,
): ReorderResult {
  const oldIndex = clips.findIndex(clip => clip.id === activeId);
  const newIndex = clips.findIndex(clip => clip.id === overId);

  if (oldIndex === -1 || newIndex === -1) {
    return { clips, transitionPrompts };
  }

  const newClips = arrayMove(clips, oldIndex, newIndex);

  const newPrompts = transitionPrompts.map(prompt => {
    const oldClipIndex = clips.findIndex(c => c.id === prompt.id);
    if (oldClipIndex !== -1 && oldClipIndex > 0) {
      const newClipIndex = newClips.findIndex(c => c.id === clips[oldClipIndex].id);
      if (newClipIndex > 0) {
        return { ...prompt, id: newClips[newClipIndex].id };
      }
    }
    return prompt;
  });

  return { clips: newClips, transitionPrompts: newPrompts };
}

// ---------------------------------------------------------------------------
// Clip state update helpers
// ---------------------------------------------------------------------------

/** Update a single clip in the array by ID. */
export function updateClipInArray(
  clips: VideoClip[],
  clipId: string,
  updates: Partial<VideoClip>,
): VideoClip[] {
  return clips.map(clip => (clip.id === clipId ? { ...clip, ...updates } : clip));
}

/** Clear a clip's video content but keep the slot. */
export function clearClipVideo(clip: VideoClip): VideoClip {
  return {
    ...clip,
    url: '',
    posterUrl: undefined,
    finalFrameUrl: undefined,
    file: undefined,
    loaded: false,
    playing: false,
  };
}
