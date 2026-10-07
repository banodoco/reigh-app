import firstLightThumbnailUrl from '../../light-study-assets/first-light-thumb.webp?url';
import type { PublicAstridExampleMetadata } from '../../publicAstridExample.tsx';

/** Lightweight shell metadata; the timeline/provider/script stay behind the editor boundary. */
export const LIGHT_STUDY_METADATA: PublicAstridExampleMetadata = Object.freeze({
  id: 'light-study-v1',
  title: 'Light study',
  timelineName: 'Light study',
  posterUrl: firstLightThumbnailUrl,
  durationSeconds: 28,
  clipCount: 3,
});
