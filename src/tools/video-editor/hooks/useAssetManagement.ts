import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { GenerationDropData } from '@/shared/lib/dnd/dragDrop.ts';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError.ts';
import { getMediaUrl, getThumbnailUrl } from '@/shared/lib/media/mediaTypeHelpers.ts';
import { uploadBlobToStorage, uploadImageToStorage } from '@/shared/lib/media/imageUploader.ts';
import { extractVideoMetadata } from '@/shared/lib/media/videoMetadata.ts';
import { extractVideoPosterFrame } from '@/shared/lib/media/videoPosterExtractor.ts';
import { generateClientThumbnail, uploadImageWithThumbnail } from '@/shared/media/clientThumbnailGenerator.ts';
import type { SelectClipOptions } from '@/shared/state/selectionStore.ts';
import { createExternalUploadGeneration } from '@/integrations/supabase/repositories/generationMutationsRepository.ts';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import {
  previewPreparedMediaCommand,
  type PlacePreparedMediaCommand,
} from '@/tools/video-editor/commands/media.ts';
import type { TimelineProvisionedAsset } from '@/tools/video-editor/commands/provisioning.ts';
import {
  type TimelineData,
} from '@/tools/video-editor/lib/timeline-data.ts';
import {
  buildAssetDropEdit,
  estimateAssetDuration,
  getPlayableAssetKind,
  planAssetDropTarget,
  planGenerationAssetRegistration,
} from '@/tools/video-editor/lib/timeline-asset-plans.ts';
import type {
  TimelineApplyEdit,
  TimelineInvalidateAssetRegistry,
  TimelinePatchRegistry,
  TimelineRegisterAsset,
  TimelineUnpatchRegistry,
  TimelineUploadAsset,
} from '@/tools/video-editor/hooks/timeline-state-types.ts';
import type { TimelineStoreApi } from '@/tools/video-editor/hooks/timelineStore.ts';

type UploadedGenerationData = GenerationDropData & {
  assetId?: string;
  durationSeconds?: number;
};

export interface UseAssetManagementArgs {
  store?: TimelineStoreApi;
  dataRef: MutableRefObject<TimelineData | null>;
  selectedTrackId: string | null;
  selectedProjectId: string | null;
  selectClip: (clipId: string, opts?: SelectClipOptions) => void;
  setSelectedTrackId: Dispatch<SetStateAction<string | null>>;
  applyEdit: TimelineApplyEdit;
  patchRegistry: TimelinePatchRegistry;
  unpatchRegistry: TimelineUnpatchRegistry;
  registerAsset: TimelineRegisterAsset;
  uploadAsset: TimelineUploadAsset;
  invalidateAssetRegistry: TimelineInvalidateAssetRegistry;
  resolveAssetUrl: (file: string) => Promise<string>;
}

export interface UseAssetManagementResult {
  prepareGenerationAsset: (data: UploadedGenerationData | null) => TimelineProvisionedAsset | null;
  registerGenerationAsset: (data: UploadedGenerationData | null) => string | null;
  uploadImageGeneration: (file: File) => Promise<{
    generationId: string;
    variantType: 'image';
    imageUrl: string;
    thumbUrl: string;
    metadata: {
      content_type: string;
      original_filename: string;
    };
  }>;
  uploadVideoGeneration: (file: File) => Promise<{
    generationId: string;
    variantType: 'video';
    imageUrl: string;
    thumbUrl: string;
    durationSeconds?: number;
    metadata: {
      content_type: string;
      original_filename: string;
    };
  }>;
  handleAssetDrop: (
    assetKey: string,
    trackId: string | undefined,
    time: number,
    forceNewTrack?: boolean,
    insertAtTop?: boolean,
    preparedAsset?: TimelineProvisionedAsset,
    removeClipId?: string,
  ) => boolean;
}

export interface AssetDropTargetResolution {
  current: TimelineData;
  trackId: string;
  snappedTime?: number;
}
export { buildAssetDropEdit };
export type { BuildAssetDropEditResult } from '@/tools/video-editor/lib/timeline-asset-plans.ts';

export function resolveAssetDropTarget({
  dataRef,
  assetKind,
  trackId,
  selectedTrackId,
  forceNewTrack = false,
  insertAtTop = false,
  time,
  duration,
}: {
  dataRef: MutableRefObject<TimelineData | null>;
  assetKind: 'audio' | 'visual';
  trackId: string | undefined;
  selectedTrackId: string | null;
  forceNewTrack?: boolean;
  insertAtTop?: boolean;
  time?: number;
  duration?: number;
}): AssetDropTargetResolution | null {
  const plan = planAssetDropTarget({
    current: dataRef.current,
    assetKind,
    trackId,
    selectedTrackId,
    forceNewTrack,
    insertAtTop,
    time,
    duration,
  });
  if (!plan.ok) {
    return null;
  }

  dataRef.current = plan.preparedCurrent;
  return {
    current: plan.preparedCurrent,
    trackId: plan.trackId,
    ...(plan.snappedTime !== undefined ? { snappedTime: plan.snappedTime } : {}),
  };
}

export function useAssetManagement({
  store,
  dataRef,
  selectedTrackId,
  selectedProjectId,
  selectClip,
  setSelectedTrackId,
  applyEdit,
  patchRegistry,
  unpatchRegistry,
  registerAsset,
}: UseAssetManagementArgs): UseAssetManagementResult {
  const runtime = useVideoEditorRuntime();
  const getDataRef = useCallback(() => {
    const storeDataRef = store?.getState().data.dataRef;
    return storeDataRef && storeDataRef.current !== null ? storeDataRef : dataRef;
  }, [dataRef, store]);
  const getSelectedTrackId = useCallback(() => {
    return store?.getState().data.selectedTrackId ?? selectedTrackId;
  }, [selectedTrackId, store]);
  const getPatchRegistry = useCallback(() => {
    return store?.getState().ops.patchRegistry ?? patchRegistry;
  }, [patchRegistry, store]);
  const getUnpatchRegistry = useCallback(() => {
    return store?.getState().ops.unpatchRegistry ?? unpatchRegistry;
  }, [store, unpatchRegistry]);
  const getRegisterAsset = useCallback(() => {
    return store?.getState().ops.registerAsset ?? registerAsset;
  }, [registerAsset, store]);
  const getApplyEdit = useCallback(() => {
    return store?.getState().ops.applyEdit ?? applyEdit;
  }, [applyEdit, store]);
  const getSelectClip = useCallback(() => {
    return store?.getState().ops.selectClip ?? selectClip;
  }, [selectClip, store]);
  const getSetSelectedTrackId = useCallback(() => {
    return store?.getState().ops.setSelectedTrackId ?? setSelectedTrackId;
  }, [setSelectedTrackId, store]);

  const prepareGenerationAsset = useCallback((generationData: UploadedGenerationData | null): TimelineProvisionedAsset | null => {
    if (!generationData) {
      return null;
    }

    const imageUrl = getMediaUrl(generationData);
    if (!imageUrl) {
      return null;
    }
    const plan = planGenerationAssetRegistration({
      generationId: generationData.generationId,
      assetId: generationData.assetId,
      variantId: generationData.variantId,
      variantType: generationData.variantType,
      mediaId: generationData.mediaId,
      imageUrl,
      thumbUrl: getThumbnailUrl(generationData),
      assetDurationSeconds: generationData.durationSeconds,
      metadata: generationData.metadata,
    });
    if (!plan.ok) {
      console.warn('[video-editor] Skipping generation asset registration because media URL is empty', {
        generationId: generationData.generationId,
        variantId: generationData.variantId,
        variantType: generationData.variantType,
      });
      return null;
    }

    const playableKind = getPlayableAssetKind(plan.assetEntry);
    if (!playableKind) {
      return null;
    }

    return {
      assetKey: plan.assetId,
      mediaType: playableKind,
      durationSeconds: plan.assetEntry.duration ?? null,
      entry: plan.assetEntry,
      source: 'registered',
    };
  }, []);

  const registerGenerationAsset = useCallback((generationData: UploadedGenerationData | null) => {
    const prepared = prepareGenerationAsset(generationData);
    if (!prepared) {
      return null;
    }

    const assetKey = prepared.assetKey;
    getPatchRegistry()(assetKey, prepared.entry, prepared.entry.file);
    const persistPromise = getRegisterAsset()(assetKey, prepared.entry);
    void persistPromise.catch((error) => {
      console.error('[video-editor] Failed to persist generation asset:', error);
      getUnpatchRegistry()(assetKey);
      runtime.toast.error('Failed to save asset');
    });

    return assetKey;
  }, [getPatchRegistry, getRegisterAsset, getUnpatchRegistry, prepareGenerationAsset, runtime.toast]);

  const placePreparedAsset = useCallback((
    prepared: TimelineProvisionedAsset,
    trackId: string | undefined,
    time: number,
    forceNewTrack: boolean,
    insertAtTop: boolean,
    removeClipId?: string,
  ) => {
    const latestDataRef = getDataRef();
    const current = latestDataRef.current;
    if (!current) {
      return false;
    }

    const command: PlacePreparedMediaCommand = {
      type: 'place-prepared-media',
      payload: {
        asset: prepared,
        trackId,
        selectedTrackId: getSelectedTrackId(),
        at: time,
        forceNewTrack,
        insertAtTop,
        removeClipId,
      },
    };
    const preview = previewPreparedMediaCommand(current, command);
    if (!preview?.commandResult?.detail) {
      return false;
    }
    const clipId = typeof preview.commandResult.detail.clipId === 'string'
      ? preview.commandResult.detail.clipId
      : null;
    const resolvedTrackId = typeof preview.commandResult.detail.trackId === 'string'
      ? preview.commandResult.detail.trackId
      : trackId ?? null;
    if (!clipId || !resolvedTrackId) {
      return false;
    }

    getApplyEdit()({ type: 'prepared-media', command }, {
      selectedClipId: clipId,
      selectedTrackId: resolvedTrackId,
      semantic: true,
    });
    return true;
  }, [getApplyEdit, getDataRef, getSelectedTrackId]);

  const handleAssetDrop = useCallback((assetKey: string, trackId: string | undefined, time: number, forceNewTrack = false, insertAtTop = false, preparedAsset?: TimelineProvisionedAsset, removeClipId?: string) => {
    if (preparedAsset) {
      return placePreparedAsset(preparedAsset, trackId, time, forceNewTrack, insertAtTop, removeClipId);
    }

    const latestDataRef = getDataRef();
    const current = latestDataRef.current;
    const assetEntry = current?.registry.assets[assetKey];
    const playableKind = getPlayableAssetKind(assetEntry);
    if (!assetEntry || !playableKind) {
      runtime.toast.error('Only image, video, and audio assets can be added to the timeline');
      return false;
    }
    const assetKind = playableKind === 'audio' ? 'audio' : 'visual';
    const duration = estimateAssetDuration(assetEntry, assetKind);
    const targetPlan = planAssetDropTarget({
      current,
      assetKind,
      trackId,
      selectedTrackId: getSelectedTrackId(),
      forceNewTrack,
      insertAtTop,
      time,
      duration,
    });
    if (!targetPlan.ok) {
      return false;
    }
    const resolvedTarget = {
      current: targetPlan.preparedCurrent,
      trackId: targetPlan.trackId,
      snappedTime: targetPlan.snappedTime,
    };
    const nextEdit = buildAssetDropEdit({
      current: resolvedTarget.current,
      assetKey,
      trackId: resolvedTarget.trackId,
      time: resolvedTarget.snappedTime ?? time,
    });
    if (!nextEdit) {
      return false;
    }
    latestDataRef.current = resolvedTarget.current;
    getApplyEdit()({
      type: 'rows',
      rows: nextEdit.rows,
      metaUpdates: nextEdit.metaUpdates,
      clipOrderOverride: nextEdit.clipOrderOverride,
    });
    getSelectClip()(nextEdit.clipId);
    getSetSelectedTrackId()(resolvedTarget.trackId);
    return true;
  }, [getApplyEdit, getDataRef, getSelectedTrackId, getSelectClip, getSetSelectedTrackId, placePreparedAsset, runtime.toast]);

  const uploadImageGeneration = useCallback(async (file: File) => {
    if (!selectedProjectId) {
      throw new Error('External image drop requires a selected project');
    }

    let imageUrl = '';
    let thumbnailUrl = '';

    try {
      const thumbnailResult = await generateClientThumbnail(file, 300, 0.8);
      const uploadResult = await uploadImageWithThumbnail(file, thumbnailResult.thumbnailBlob);
      imageUrl = uploadResult.imageUrl;
      thumbnailUrl = uploadResult.thumbnailUrl;
    } catch (error) {
      normalizeAndPresentError(error, { context: `video-editor:external-drop:${file.name}`, showToast: false });
      imageUrl = await uploadImageToStorage(file, 3);
      thumbnailUrl = imageUrl;
    }

    const generation = await createExternalUploadGeneration({
      imageUrl,
      thumbnailUrl,
      fileType: 'image',
      projectId: selectedProjectId,
      generationParams: {
        prompt: `Uploaded ${file.name}`,
        extra: {
          source: 'external_upload',
          original_filename: file.name,
          file_type: file.type || 'image',
          file_size: file.size,
        },
      },
    });

    return {
      generationId: generation.id,
      variantType: 'image' as const,
      imageUrl,
      thumbUrl: thumbnailUrl,
      metadata: {
        content_type: file.type || 'image',
        original_filename: file.name,
      },
    };
  }, [selectedProjectId]);

  const uploadVideoGeneration = useCallback(async (file: File) => {
    if (!selectedProjectId) {
      throw new Error('No project selected');
    }

    const videoUrl = await uploadImageToStorage(file);

    let thumbnailUrl = videoUrl;
    try {
      const thumbnailBlob = await extractVideoPosterFrame(file);
      thumbnailUrl = await uploadBlobToStorage(thumbnailBlob, 'thumbnail.jpg', 'image/jpeg');
    } catch (error) {
      normalizeAndPresentError(error, { context: `video-editor:external-video-thumbnail:${file.name}`, showToast: false });
    }

    let durationSeconds: number | undefined;
    try {
      const metadata = await extractVideoMetadata(file);
      durationSeconds = metadata.duration_seconds;
    } catch (error) {
      normalizeAndPresentError(error, { context: `video-editor:external-video-metadata:${file.name}`, showToast: false });
    }

    const generation = await createExternalUploadGeneration({
      imageUrl: videoUrl,
      thumbnailUrl,
      fileType: 'video',
      projectId: selectedProjectId,
      generationParams: {
        prompt: file.name.replace(/\.[^.]+$/, ''),
        extra: {
          source: 'external_upload',
          original_filename: file.name,
          file_type: file.type || 'video/mp4',
          file_size: file.size,
        },
      },
    });

    return {
      generationId: generation.id,
      variantType: 'video' as const,
      imageUrl: videoUrl,
      thumbUrl: thumbnailUrl,
      durationSeconds,
      metadata: {
        content_type: file.type || 'video/mp4',
        original_filename: file.name,
      },
    };
  }, [selectedProjectId]);

  return {
    prepareGenerationAsset,
    registerGenerationAsset,
    uploadImageGeneration,
    uploadVideoGeneration,
    handleAssetDrop,
  };
}
