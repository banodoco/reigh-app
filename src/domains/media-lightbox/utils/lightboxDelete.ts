import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { LightboxDeleteHandler } from '../types';

/**
 * Invoke a lightbox delete handler with standard error presentation.
 * Used by ImageLightbox, VideoLightbox, and useSharedLightboxState to avoid
 * duplicating the same try/catch + normalizeAndPresentError wrapper.
 */
export async function invokeLightboxDelete(
  onDelete: LightboxDeleteHandler,
  mediaId: string,
  context: string,
): Promise<void> {
  try {
    await Promise.resolve(onDelete(mediaId));
  } catch (error) {
    normalizeAndPresentError(error, {
      context,
      toastTitle: 'Delete Failed',
    });
  }
}
