import type { UseAssetManagementArgs, UseAssetManagementResult } from '@/tools/video-editor/hooks/useAssetManagement.ts';
import type { ShotFinalVideo } from '@/tools/video-editor/hooks/useFinalVideoAvailable.ts';

/** Services supplied by an installed host, or explicitly disabled by a public host. */
export interface TimelineHostServiceHooks {
  useAssetManagement: (args: UseAssetManagementArgs) => UseAssetManagementResult;
  useFinalVideoMap: () => Map<string, ShotFinalVideo>;
}

function unavailable(): never {
  throw new Error('This editor host does not provide media mutation services.');
}

const EMPTY_FINAL_VIDEOS = new Map<string, ShotFinalVideo>();

/** Hook-compatible service slots for a local browse-only document. */
export const PUBLIC_TIMELINE_SERVICE_HOOKS: TimelineHostServiceHooks = Object.freeze({
  useAssetManagement: () => ({
    prepareGenerationAsset: unavailable,
    registerGenerationAsset: unavailable,
    uploadImageGeneration: unavailable,
    uploadVideoGeneration: unavailable,
    handleAssetDrop: unavailable,
  }),
  useFinalVideoMap: () => EMPTY_FINAL_VIDEOS,
});
