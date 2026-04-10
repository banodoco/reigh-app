import { useCallback } from 'react';
import { generateUUID } from '@/shared/lib/taskCreation/ids';
import {
  buildSwitchShotGroupToFinalVideoMutation,
  buildSwitchShotGroupToImagesMutation,
  buildUpdateShotGroupToLatestVideoMutation,
} from '@/tools/video-editor/lib/shot-group-commands';
import type {
  TimelineApplyEdit,
  TimelineDataRef,
  TimelinePatchRegistry,
  TimelineRegisterAsset,
} from '@/tools/video-editor/hooks/timeline-state-types';
import type { ShotFinalVideo } from '@/tools/video-editor/hooks/useFinalVideoAvailable';
import type { AssetRegistryEntry } from '@/tools/video-editor/types';

interface UseSwitchToFinalVideoArgs {
  applyEdit: TimelineApplyEdit;
  dataRef: TimelineDataRef;
  finalVideoMap: Map<string, ShotFinalVideo>;
  patchRegistry: TimelinePatchRegistry;
  registerAsset: TimelineRegisterAsset;
}

function registerFinalVideoAsset(
  finalVideo: ShotFinalVideo,
  patchRegistry: TimelinePatchRegistry,
  registerAsset: TimelineRegisterAsset,
): string {
  const assetKey = generateUUID();
  const assetEntry: AssetRegistryEntry = {
    file: finalVideo.location,
    type: 'video/mp4',
    generationId: finalVideo.id,
  };
  patchRegistry(assetKey, assetEntry, finalVideo.location);
  void registerAsset(assetKey, assetEntry).catch((error) => {
    console.error('[TimelineEditor] Failed to persist final video asset:', error);
  });
  return assetKey;
}

export function useSwitchToFinalVideo({
  applyEdit,
  dataRef,
  finalVideoMap,
  patchRegistry,
  registerAsset,
}: UseSwitchToFinalVideoArgs) {
  const switchToFinalVideo = useCallback(({ shotId, clipIds, rowId }: { shotId: string; clipIds: string[]; rowId: string }) => {
    const finalVideo = finalVideoMap.get(shotId);
    if (!finalVideo) {
      return;
    }

    const assetKey = registerFinalVideoAsset(finalVideo, patchRegistry, registerAsset);
    const mutation = buildSwitchShotGroupToFinalVideoMutation({
      currentData: dataRef.current,
      shotId,
      rowId,
      clipIds,
      assetKey,
    });
    if (!mutation) {
      return;
    }

    applyEdit(mutation);
  }, [applyEdit, dataRef, finalVideoMap, patchRegistry, registerAsset]);

  const updateToLatestVideo = useCallback(({ shotId, rowId }: { shotId: string; rowId: string }) => {
    const finalVideo = finalVideoMap.get(shotId);
    if (!finalVideo) {
      return;
    }

    const assetKey = registerFinalVideoAsset(finalVideo, patchRegistry, registerAsset);
    const mutation = buildUpdateShotGroupToLatestVideoMutation({
      currentData: dataRef.current,
      shotId,
      rowId,
      assetKey,
      targetGenerationId: finalVideo.id,
    });
    if (!mutation) {
      return;
    }

    applyEdit(mutation);
  }, [applyEdit, dataRef, finalVideoMap, patchRegistry, registerAsset]);

  const switchToImages = useCallback(({ shotId, rowId }: { shotId: string; rowId: string }) => {
    const mutation = buildSwitchShotGroupToImagesMutation({
      currentData: dataRef.current,
      shotId,
      rowId,
    });
    if (!mutation) {
      return;
    }

    applyEdit(mutation);
  }, [applyEdit, dataRef]);

  return {
    switchToFinalVideo,
    updateToLatestVideo,
    switchToImages,
  };
}
