/**
 * Gallery utility functions
 *
 * Functions for extracting and processing gallery/segment data
 * Moved from tools/travel-between-images/components/VideoGallery/utils/gallery-utils.ts
 */

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

  const taskParams = (params || {}) as Record<string, unknown>;
  const orchestratorDetails = (taskParams.orchestrator_details || {}) as Record<string, unknown>;
  const individualSegmentParams = (taskParams.individual_segment_params || {}) as Record<string, unknown>;

  // Priority 1: Explicit URLs (set by individual_travel_segment tasks)
  const explicitStartUrl = cleanUrl((individualSegmentParams.start_image_url || taskParams.start_image_url) as string | undefined);
  const explicitEndUrl = cleanUrl((individualSegmentParams.end_image_url || taskParams.end_image_url) as string | undefined);
  const explicitStartGenId = (individualSegmentParams.start_image_generation_id || taskParams.start_image_generation_id) as string | undefined;
  const explicitEndGenId = (individualSegmentParams.end_image_generation_id || taskParams.end_image_generation_id) as string | undefined;

  // Priority 2: Array-based extraction (orchestrator tasks store all images in arrays)
  const allUrls = (orchestratorDetails.input_image_paths_resolved ||
                  taskParams.input_image_paths_resolved ||
                  []) as string[];
  const allGenIds = (orchestratorDetails.input_image_generation_ids ||
                    taskParams.input_image_generation_ids ||
                    []) as string[];

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
