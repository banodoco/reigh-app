/**
 * Gallery utility functions
 *
 * Functions for extracting and processing gallery/segment data
 * Moved from tools/travel-between-images/components/VideoGallery/utils/gallery-utils.ts
 */
import { asRecord, asString, asStringArray } from '@/shared/lib/tasks/taskParamParsers';

/**
 * Result of extracting segment input images from params
 */
interface SegmentImageInfo {
  startUrl: string | undefined;
  endUrl: string | undefined;
  startGenId: string | undefined;
  endGenId: string | undefined;
  hasImages: boolean;
}

/**
 * Extract segment input images from task/generation params
 *
 * This is the single source of truth for getting start/end images for a segment.
 * It handles multiple storage formats:
 * 1. Explicit URLs (start_image_url, end_image_url) - used by individual segment tasks
 * 2. Array indexing (input_image_paths_resolved[index]) - used by orchestrator tasks
 *
 * @param params - Task or generation params object
 * @param segmentIndex - Optional segment index for array-based extraction (default: 0)
 * @returns SegmentImageInfo with start/end URLs and generation IDs
 */
export const extractSegmentImages = (params: Record<string, unknown> | null | undefined, segmentIndex: number = 0): SegmentImageInfo => {
  const cleanUrl = (url: string | undefined): string | undefined => {
    if (typeof url !== 'string') return undefined;
    // Remove surrounding quotes if present
    return url.replace(/^["']|["']$/g, '');
  };

  const taskParams = asRecord(params) ?? {};
  const orchestratorDetails = asRecord(taskParams.orchestrator_details) ?? {};
  const individualSegmentParams = asRecord(taskParams.individual_segment_params) ?? {};

  // Priority 1: Explicit URLs (set by individual_travel_segment tasks)
  const explicitStartUrl = cleanUrl(
    asString(individualSegmentParams.start_image_url) ?? asString(taskParams.start_image_url),
  );
  const explicitEndUrl = cleanUrl(
    asString(individualSegmentParams.end_image_url) ?? asString(taskParams.end_image_url),
  );
  const explicitStartGenId = asString(individualSegmentParams.start_image_generation_id)
    ?? asString(taskParams.start_image_generation_id);
  const explicitEndGenId = asString(individualSegmentParams.end_image_generation_id)
    ?? asString(taskParams.end_image_generation_id);

  // Priority 2: Array-based extraction (orchestrator tasks store all images in arrays)
  const allUrls = asStringArray(orchestratorDetails.input_image_paths_resolved)
    ?? asStringArray(taskParams.input_image_paths_resolved)
    ?? [];
  const allGenIds = asStringArray(orchestratorDetails.input_image_generation_ids)
    ?? asStringArray(taskParams.input_image_generation_ids)
    ?? [];

  // For segment at index N, we need images[N] (start) and images[N+1] (end)
  const arrayStartUrl = cleanUrl(allUrls[segmentIndex]);
  const arrayEndUrl = cleanUrl(allUrls[segmentIndex + 1]);
  const arrayStartGenId = allGenIds[segmentIndex];
  const arrayEndGenId = allGenIds[segmentIndex + 1];

  // Use explicit values if available, otherwise fall back to array
  const startUrl = explicitStartUrl || arrayStartUrl;
  const endUrl = explicitEndUrl || arrayEndUrl;
  const startGenId = explicitStartGenId || arrayStartGenId;
  const endGenId = explicitEndGenId || arrayEndGenId;

  return {
    startUrl,
    endUrl,
    startGenId,
    endGenId,
    hasImages: !!(startUrl || endUrl),
  };
};
