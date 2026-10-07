import { LIGHT_STUDY_PUBLIC_EXAMPLE } from './content/light-study-v1/public-example.ts';
import { PublicAstridExampleWriteError } from './publicAstridExample.tsx';
import type { TimelineConfig } from '@/tools/video-editor/types/index.ts';

/** Compatibility aliases for C01/sample-specific tests and provenance tooling. */
export const PUBLIC_LIGHT_TIMELINE_ID = LIGHT_STUDY_PUBLIC_EXAMPLE.timelineId;
export const PUBLIC_LIGHT_STUDY_PROVIDER = LIGHT_STUDY_PUBLIC_EXAMPLE.dataProvider;
export const PUBLIC_LIGHT_STUDY_THUMBNAIL_URL = LIGHT_STUDY_PUBLIC_EXAMPLE.metadata.posterUrl;
export const PUBLIC_LIGHT_STUDY_SILENT_VIDEO_HASHES = LIGHT_STUDY_PUBLIC_EXAMPLE.silentVideoWaveformAssetHashes;
export { PublicAstridExampleWriteError as PublicLightStudyWriteError };

export function getPublicLightStudyConfig(): TimelineConfig {
  return structuredClone(LIGHT_STUDY_PUBLIC_EXAMPLE.timeline);
}
