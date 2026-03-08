import { asRecord, asString, asStringArray } from '@/shared/lib/tasks/taskParamParsers';

interface SegmentImageInfo {
  startUrl: string | undefined;
  endUrl: string | undefined;
  startGenId: string | undefined;
  endGenId: string | undefined;
  hasImages: boolean;
}

export const extractSegmentImages = (
  params: Record<string, unknown> | null | undefined,
  segmentIndex: number = 0,
): SegmentImageInfo => {
  const cleanUrl = (url: string | undefined): string | undefined => {
    if (typeof url !== 'string') return undefined;
    return url.replace(/^["']|["']$/g, '');
  };

  const taskParams = asRecord(params) ?? {};
  const orchestratorDetails = asRecord(taskParams.orchestrator_details) ?? {};
  const individualSegmentParams = asRecord(taskParams.individual_segment_params) ?? {};

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

  const allUrls = asStringArray(orchestratorDetails.input_image_paths_resolved)
    ?? asStringArray(taskParams.input_image_paths_resolved)
    ?? [];
  const allGenIds = asStringArray(orchestratorDetails.input_image_generation_ids)
    ?? asStringArray(taskParams.input_image_generation_ids)
    ?? [];

  const arrayStartUrl = cleanUrl(allUrls[segmentIndex]);
  const arrayEndUrl = cleanUrl(allUrls[segmentIndex + 1]);
  const arrayStartGenId = allGenIds[segmentIndex];
  const arrayEndGenId = allGenIds[segmentIndex + 1];

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
