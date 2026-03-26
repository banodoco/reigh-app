import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { getGenerationDropData } from '@/shared/lib/dnd/dragDrop';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { uploadImageToStorage } from '@/shared/lib/media/imageUploader';
import { generateClientThumbnail, uploadImageWithThumbnail } from '@/shared/media/clientThumbnailGenerator';
import { createExternalUploadGeneration } from '@/integrations/supabase/repositories/generationMutationsRepository';
import { generateUUID } from '@/shared/lib/taskCreation/ids';
import { getCompatibleTrackId, updateClipOrder } from '@/tools/video-editor/lib/coordinate-utils';
import {
  getNextClipId,
  inferTrackType,
  type ClipMeta,
  type TimelineData,
} from '@/tools/video-editor/lib/timeline-data';
import type { UseTimelineDataResult } from '@/tools/video-editor/hooks/useTimelineData';
import type { TimelineAction } from '@/tools/video-editor/types/timeline-canvas';
import type { AssetRegistryEntry, ClipType } from '@/tools/video-editor/types';

export interface UseAssetManagementArgs {
  dataRef: MutableRefObject<TimelineData | null>;
  selectedTrackId: string | null;
  selectedProjectId: string | null;
  setSelectedClipId: Dispatch<SetStateAction<string | null>>;
  setSelectedTrackId: Dispatch<SetStateAction<string | null>>;
  applyTimelineEdit: UseTimelineDataResult['applyTimelineEdit'];
  patchRegistry: UseTimelineDataResult['patchRegistry'];
  registerAsset: UseTimelineDataResult['registerAsset'];
  uploadAsset: UseTimelineDataResult['uploadAsset'];
  invalidateAssetRegistry: UseTimelineDataResult['invalidateAssetRegistry'];
  resolveAssetUrl: (file: string) => Promise<string>;
}

export interface UseAssetManagementResult {
  registerGenerationAsset: (data: ReturnType<typeof getGenerationDropData>) => string | null;
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
  handleAssetDrop: (assetKey: string, trackId: string | undefined, time: number, forceNewTrack?: boolean) => void;
}

export function useAssetManagement({
  dataRef,
  selectedTrackId,
  selectedProjectId,
  setSelectedClipId,
  setSelectedTrackId,
  applyTimelineEdit,
  patchRegistry,
  registerAsset,
}: UseAssetManagementArgs): UseAssetManagementResult {
  const registerGenerationAsset = useCallback((generationData: ReturnType<typeof getGenerationDropData>) => {
    if (!generationData) {
      return null;
    }

    const mimeType = (() => {
      const metadataContentType = typeof generationData.metadata?.content_type === 'string'
        ? generationData.metadata.content_type
        : null;
      if (metadataContentType?.includes('/')) {
        return metadataContentType;
      }
      if (metadataContentType === 'video' || generationData.variantType === 'video' || /\.(mp4|mov|webm|m4v)$/i.test(generationData.imageUrl)) {
        return 'video/mp4';
      }
      if (metadataContentType === 'audio' || /\.(mp3|wav|aac|m4a)$/i.test(generationData.imageUrl)) {
        return 'audio/mpeg';
      }
      return 'image/png';
    })();

    const assetId = generateUUID();
    const entry: AssetRegistryEntry = {
      file: generationData.imageUrl,
      type: mimeType,
      generationId: generationData.generationId,
      variantId: generationData.variantId,
    };

    patchRegistry(assetId, entry, generationData.imageUrl);
    void registerAsset(assetId, entry).catch((error) => {
      console.error('[video-editor] Failed to persist generation asset:', error);
    });

    return assetId;
  }, [patchRegistry, registerAsset]);

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

  const handleAssetDrop = useCallback((assetKey: string, trackId: string | undefined, time: number, forceNewTrack = false) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const assetEntry = current.registry.assets[assetKey];
    const assetKind = inferTrackType(assetEntry?.file ?? assetKey);
    let resolvedTrackId = forceNewTrack
      ? null
      : getCompatibleTrackId(current.tracks, trackId, assetKind, selectedTrackId);

    // If no compatible track exists (or forced new track), create one
    if (!resolvedTrackId) {
      const existingCount = current.tracks.filter((t) => t.kind === assetKind).length;
      resolvedTrackId = `${assetKind === 'audio' ? 'A' : 'V'}${existingCount + 1}`;
      const newTrack = {
        id: resolvedTrackId,
        kind: assetKind,
        label: `${assetKind === 'audio' ? 'Audio' : 'Visual'} ${existingCount + 1}`,
      };
      current.tracks.push(newTrack);
      current.rows.push({ id: resolvedTrackId, actions: [] });
    }

    const track = current.tracks.find((candidate) => candidate.id === resolvedTrackId);
    if (!track) {
      return;
    }

    const clipId = getNextClipId(current.meta);
    const isImage = assetEntry?.type?.startsWith('image');
    const isVideo = assetEntry?.type?.startsWith('video') || (!isImage && assetKind === 'visual' && assetEntry?.duration);
    const isManual = track.fit === 'manual';
    const clipType: ClipType = isImage ? 'hold' : 'media';
    // Use actual asset duration for videos/audio instead of capping at 5s
    const baseDuration = isVideo
      ? (assetEntry?.duration ?? 5)
      : isImage
        ? 5
        : Math.max(1, assetEntry?.duration ?? 5);

    let clipMeta: ClipMeta;
    let duration: number;

    if (track.kind === 'audio') {
      duration = assetEntry?.duration ?? 10;
      clipMeta = {
        asset: assetKey,
        track: resolvedTrackId,
        clipType: 'media',
        from: 0,
        to: duration,
        speed: 1,
        volume: 1,
      };
    } else if (isImage) {
      duration = 5;
      clipMeta = {
        asset: assetKey,
        track: resolvedTrackId,
        clipType,
        hold: duration,
        opacity: 1,
        x: isManual ? 100 : undefined,
        y: isManual ? 100 : undefined,
        width: isManual ? 320 : undefined,
        height: isManual ? 240 : undefined,
      };
    } else {
      duration = baseDuration;
      clipMeta = {
        asset: assetKey,
        track: resolvedTrackId,
        clipType,
        from: 0,
        to: duration,
        speed: 1,
        volume: 1,
        opacity: 1,
        x: isManual ? 100 : undefined,
        y: isManual ? 100 : undefined,
        width: isManual ? 320 : undefined,
        height: isManual ? 240 : undefined,
      };
    }

    const action: TimelineAction = {
      id: clipId,
      start: time,
      end: time + duration,
      effectId: `effect-${clipId}`,
    };

    const nextRows = current.rows.map((row) => (row.id === resolvedTrackId ? { ...row, actions: [...row.actions, action] } : row));
    const nextClipOrder = updateClipOrder(current.clipOrder, resolvedTrackId, (ids) => [...ids, clipId]);
    applyTimelineEdit(nextRows, { [clipId]: clipMeta }, undefined, nextClipOrder);
    setSelectedClipId(clipId);
    setSelectedTrackId(resolvedTrackId);
  }, [applyTimelineEdit, dataRef, selectedTrackId, setSelectedClipId, setSelectedTrackId]);

  return {
    registerGenerationAsset,
    uploadImageGeneration,
    handleAssetDrop,
  };
}
