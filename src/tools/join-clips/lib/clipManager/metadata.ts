import { extractVideoMetadataFromUrl } from '@/shared/lib/media/videoUploader';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  operationFailure,
  operationSuccess,
  type OperationResult,
} from '@/shared/lib/operationResult';
import type { VideoClip } from '../../types';

export function getClipsNeedingDuration(clips: VideoClip[]): VideoClip[] {
  return clips.filter(
    clip => clip.url && clip.durationSeconds === undefined && !clip.metadataLoading && !clip.durationLoadFailed,
  );
}

export async function loadClipDuration(
  clip: VideoClip,
): Promise<OperationResult<{ id: string; durationSeconds: number }>> {
  try {
    const metadata = await extractVideoMetadataFromUrl(clip.url);
    return operationSuccess({ id: clip.id, durationSeconds: metadata.duration_seconds });
  } catch (error) {
    normalizeAndPresentError(error, {
      context: 'JoinClipsPage',
      showToast: false,
      logData: { clipId: clip.id },
    });
    return operationFailure(error, {
      policy: 'degrade',
      errorCode: 'clip_metadata_load_failed',
      message: 'Failed to load clip metadata',
      recoverable: true,
      cause: { clipId: clip.id },
    });
  }
}
