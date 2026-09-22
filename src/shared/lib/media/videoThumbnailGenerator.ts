/**
 * Video Thumbnail Generator
 *
 * Extracts thumbnails from videos on the client side and uploads them to storage.
 * This is used to generate missing thumbnails for videos that don't have them.
 */

import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';
import { storagePaths, MEDIA_BUCKET, publicMediaObjectUrl } from '@/shared/lib/storagePaths';
import { getSupabaseUrl } from '@/integrations/supabase/config/env';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { captureVideoFrameBlob } from './captureVideoFrameBlob';

interface ThumbnailGenerationResult {
  success: boolean;
  thumbnailUrl?: string;
  error?: string;
}

interface ThumbnailExtractResult {
  success: boolean;
  thumbnailUrl?: string;
  error?: string;
}

export async function resolveAuthenticatedMediaUserId(): Promise<string> {
  const {
    data: { session },
  } = await supabase().auth.getSession();
  if (!session?.user?.id) {
    throw new Error('User not authenticated');
  }
  return session.user.id;
}

/**
 * Extracts a thumbnail from a video at a specific time
 */
function extractThumbnailFromVideo(
  videoUrl: string,
  timeInSeconds: number = 0.001
): Promise<Blob> {
  return captureVideoFrameBlob({
    source: getDisplayUrl(videoUrl),
    crossOrigin: 'anonymous',
    resolveSeekTime: (video) => Math.max(0, Math.min(timeInSeconds, video.duration - 0.1)),
    configureCanvas: (video, canvas) => {
      const maxWidth = 1280;
      const scale = Math.min(1, maxWidth / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
    },
    onVideoError: (video) => (
      new Error(`Video loading failed: ${video.error?.message || 'Unknown error'}`)
    ),
  });
}

/**
 * Uploads a thumbnail blob to Supabase storage
 * Note: projectId param kept for backwards compatibility but no longer used in path
 */
async function uploadThumbnailToStorage(
  blob: Blob,
  generationId: string,
  _projectId: string,
  canPublish: () => boolean = () => true,
): Promise<string> {
  if (!canPublish()) {
    throw new Error('Thumbnail publication was cancelled because cloud authority changed');
  }
  const userId = await resolveAuthenticatedMediaUserId();

  if (!canPublish()) {
    throw new Error('Thumbnail publication was cancelled because cloud authority changed');
  }

  const fileName = `${generationId}-thumb.jpg`;
  const filePath = storagePaths.thumbnail(userId, fileName);

  const { error } = await supabase().storage
    .from(MEDIA_BUCKET)
    .upload(filePath, blob, {
      contentType: 'image/jpeg',
      upsert: true, // Overwrite if exists
    });

  if (error) {
    console.error('[ThumbnailGenerator] Upload failed:', error);
    throw error;
  }

  // supabase-js public-URL minting is cut (B3); the public-object address
  // form is fixed, so derive it deterministically.
  return publicMediaObjectUrl(filePath, getSupabaseUrl());
}

/**
 * Updates the generation record with the new thumbnail URL
 */
async function updateGenerationThumbnail(
  generationId: string,
  thumbnailUrl: string,
  canPublish: () => boolean = () => true,
): Promise<void> {
  if (!canPublish()) {
    throw new Error('Thumbnail publication was cancelled because cloud authority changed');
  }

  const { error } = await supabase().from('generations')
    .update({ thumbnail_url: thumbnailUrl })
    .eq('id', generationId);

  if (error) {
    console.error('[ThumbnailGenerator] Database update failed:', error);
    throw error;
  }
}

/**
 * Main function: Generates and uploads a thumbnail for a video
 */
export async function generateAndUploadThumbnail(
  videoUrl: string,
  generationId: string,
  projectId: string,
  canPublish: () => boolean = () => true,
): Promise<ThumbnailGenerationResult> {
  try {

    // Step 1: Extract thumbnail from video (first frame)
    const thumbnailBlob = await extractThumbnailFromVideo(videoUrl, 0.001);

    if (!canPublish()) {
      throw new Error('Thumbnail publication was cancelled because cloud authority changed');
    }

    // Step 2: Upload to storage
    const thumbnailUrl = await uploadThumbnailToStorage(
      thumbnailBlob,
      generationId,
      projectId,
      canPublish,
    );

    // Step 3: Update database
    if (!canPublish()) {
      throw new Error('Thumbnail publication was cancelled because cloud authority changed');
    }
    await updateGenerationThumbnail(generationId, thumbnailUrl, canPublish);

    return {
      success: true,
      thumbnailUrl,
    };
  } catch (error) {
    normalizeAndPresentError(error, { context: 'VideoThumbnailGenerator', showToast: false });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Extract and upload thumbnail only (no database update)
 * Use this for variants where you'll update the record yourself
 */
export async function extractAndUploadThumbnailOnly(
  videoUrl: string,
  uniqueId: string,
  projectId: string
): Promise<ThumbnailExtractResult> {
  try {

    // Step 1: Extract thumbnail from video (first frame)
    const thumbnailBlob = await extractThumbnailFromVideo(videoUrl, 0.001);
    
    // Step 2: Upload to storage
    const thumbnailUrl = await uploadThumbnailToStorage(thumbnailBlob, uniqueId, projectId);
    
    return {
      success: true,
      thumbnailUrl,
    };
  } catch (error) {
    normalizeAndPresentError(error, { context: 'VideoThumbnailGenerator', showToast: false });

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
