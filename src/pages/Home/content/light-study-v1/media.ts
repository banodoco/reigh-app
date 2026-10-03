import firstLightUrl from '../../light-study-assets/first-light.mp4?url';
import passingShapesUrl from '../../light-study-assets/passing-shapes.mp4?url';
import quietFinishUrl from '../../light-study-assets/quiet-finish.mp4?url';
import firstLightThumbUrl from '../../light-study-assets/first-light-thumb.webp?url';
import passingShapesThumbUrl from '../../light-study-assets/passing-shapes-thumb.webp?url';
import quietFinishThumbUrl from '../../light-study-assets/quiet-finish-thumb.webp?url';

export type LightStudyAssetId = 'first-light' | 'passing-shapes' | 'quiet-finish';

export const LIGHT_STUDY_MEDIA = Object.freeze({
  'first-light': Object.freeze({
    videoUrl: firstLightUrl,
    thumbnailUrl: firstLightThumbUrl,
    sha256: '3d29a7834b8fafb27fe9cad0ab4fe21bbda9e7bf7c8a6f3cdcac2714eca0fc40',
    duration: 8,
  }),
  'passing-shapes': Object.freeze({
    videoUrl: passingShapesUrl,
    thumbnailUrl: passingShapesThumbUrl,
    sha256: '393c57e05cf8a267ac479cf3bd870eaf45cd4b7355d565431c0266c126131763',
    duration: 12,
  }),
  'quiet-finish': Object.freeze({
    videoUrl: quietFinishUrl,
    thumbnailUrl: quietFinishThumbUrl,
    sha256: '6592b8a16c30098ce53443a9e76500e9d300820b76902d30f01d06acd2e17f49',
    duration: 8,
  }),
});

const BY_URL = new Set(Object.values(LIGHT_STUDY_MEDIA).map((asset) => asset.videoUrl));

/** The sole bridge from logical C01 media identities to Vite-owned public URLs. */
export function resolveLightStudyAssetUrl(assetId: LightStudyAssetId): string {
  return LIGHT_STUDY_MEDIA[assetId].videoUrl;
}

export function isResolvedLightStudyAssetUrl(value: string): boolean {
  return BY_URL.has(value);
}
