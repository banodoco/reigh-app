import { GenerationRow } from '@/types/shots';

/**
 * Video loading phase determination
 */
export const determineVideoPhase = (
  shouldLoad: boolean,
  videoPosterLoaded: boolean,
  _videoMetadataLoaded: boolean,
  thumbnailLoaded: boolean,
  hasThumbnail: boolean
): { phase: string; readyToShow: boolean } => {
  let phase = 'INITIAL';
  let readyToShow = false;
  
  if (hasThumbnail && thumbnailLoaded && !videoPosterLoaded && !shouldLoad) {
    phase = 'THUMBNAIL_READY';
    readyToShow = true;
  } else if (!hasThumbnail && !shouldLoad) {
    phase = 'WAITING_TO_LOAD';
  } else if (shouldLoad && !videoPosterLoaded && !hasThumbnail) {
    phase = 'VIDEO_LOADING';
  } else if (shouldLoad && !videoPosterLoaded && hasThumbnail && thumbnailLoaded) {
    phase = 'VIDEO_LOADING_WITH_THUMBNAIL';
  } else if (videoPosterLoaded) {
    phase = 'VIDEO_READY';
    readyToShow = true;
  }
  
  return { phase, readyToShow };
};

/**
 * Create loading summary for debugging
 */
export const createLoadingSummary = (hasThumbnail: boolean, thumbnailLoaded: boolean, videoPosterLoaded: boolean, shouldLoad: boolean): string => {
  return hasThumbnail 
    ? `Thumbnail: ${thumbnailLoaded ? '✅' : '⏳'} | Video: ${videoPosterLoaded ? '✅' : '⏳'}`
    : `Video: ${videoPosterLoaded ? '✅' : shouldLoad ? '⏳' : '⏸️'}`;
};

/**
 * Sort video outputs by creation date
 * @internal - only used within this file
 */
const sortVideoOutputsByDate = (videoOutputs: GenerationRow[]): GenerationRow[] => {
  return [...videoOutputs]
    .map(v => ({ v, time: new Date(v.createdAt || (v as { created_at?: string | null }).created_at || 0).getTime() }))
    .sort((a, b) => b.time - a.time)
    .map(({ v }) => v);
};

// Keeping for potential future use but not exporting
void sortVideoOutputsByDate;
