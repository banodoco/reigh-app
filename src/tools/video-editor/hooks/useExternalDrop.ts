import { useCallback, useEffect, useRef } from 'react';
import { getGenerationDropData, getDragType } from '@/shared/lib/dnd/dragDrop';
import { inferDragKind } from '@/tools/video-editor/lib/drop-position';
import type { DragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import type { UseAssetManagementResult } from '@/tools/video-editor/hooks/useAssetManagement';
import type { UseTimelineDataResult } from '@/tools/video-editor/hooks/useTimelineData';
import type { ClipMeta, TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { TimelineAction } from '@/tools/video-editor/types/timeline-canvas';
import type { TrackKind } from '@/tools/video-editor/types';
import { getCompatibleTrackId } from '@/tools/video-editor/lib/coordinate-utils';

export interface UseExternalDropArgs {
  dataRef: React.MutableRefObject<TimelineData | null>;
  scale: number;
  scaleWidth: number;
  selectedTrackId: string | null;
  applyTimelineEdit: UseTimelineDataResult['applyTimelineEdit'];
  patchRegistry: UseTimelineDataResult['patchRegistry'];
  registerAsset: UseTimelineDataResult['registerAsset'];
  uploadAsset: UseTimelineDataResult['uploadAsset'];
  invalidateAssetRegistry: UseTimelineDataResult['invalidateAssetRegistry'];
  resolveAssetUrl: (file: string) => Promise<string>;
  coordinator: DragCoordinator;
  registerGenerationAsset: UseAssetManagementResult['registerGenerationAsset'];
  uploadImageGeneration: UseAssetManagementResult['uploadImageGeneration'];
  handleAssetDrop: UseAssetManagementResult['handleAssetDrop'];
}

export interface UseExternalDropResult {
  onTimelineDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onTimelineDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onTimelineDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

export function useExternalDrop({
  dataRef,
  selectedTrackId,
  applyTimelineEdit,
  patchRegistry,
  uploadAsset,
  invalidateAssetRegistry,
  resolveAssetUrl,
  coordinator,
  registerGenerationAsset,
  uploadImageGeneration,
  handleAssetDrop,
}: UseExternalDropArgs): UseExternalDropResult {
  const externalDragFrameRef = useRef<number | null>(null);
  const latestExternalDragRef = useRef<{
    clientX: number;
    clientY: number;
    sourceKind: TrackKind | null;
  } | null>(null);
  const latestExternalPositionRef = useRef<ReturnType<DragCoordinator['update']> | null>(null);

  const clearExternalDragState = useCallback(() => {
    if (externalDragFrameRef.current !== null) {
      window.cancelAnimationFrame(externalDragFrameRef.current);
      externalDragFrameRef.current = null;
    }
    latestExternalDragRef.current = null;
    latestExternalPositionRef.current = null;
    coordinator.end();
  }, [coordinator]);

  useEffect(() => {
    return () => {
      clearExternalDragState();
    };
  }, [clearExternalDragState]);

  const onTimelineDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const dragType = getDragType(event);
    const types = Array.from(event.dataTransfer.types);
    if (!types.includes('asset-key') && dragType !== 'file' && dragType !== 'generation') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.dataset.dragOver = 'true';
    latestExternalDragRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      sourceKind: inferDragKind(event),
    };

    if (externalDragFrameRef.current !== null) {
      return;
    }

    externalDragFrameRef.current = window.requestAnimationFrame(() => {
      externalDragFrameRef.current = null;
      const currentDrag = latestExternalDragRef.current;
      if (!currentDrag) {
        return;
      }

      latestExternalPositionRef.current = coordinator.update({
        clientX: currentDrag.clientX,
        clientY: currentDrag.clientY,
        sourceKind: currentDrag.sourceKind,
      });
    });
  }, [coordinator]);

  const onTimelineDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    delete event.currentTarget.dataset.dragOver;
    clearExternalDragState();
  }, [clearExternalDragState]);

  const onTimelineDrop = useCallback(async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    delete event.currentTarget.dataset.dragOver;
    if (externalDragFrameRef.current !== null) {
      window.cancelAnimationFrame(externalDragFrameRef.current);
      externalDragFrameRef.current = null;
    }

    if (latestExternalDragRef.current) {
      latestExternalPositionRef.current = coordinator.update({
        clientX: latestExternalDragRef.current.clientX,
        clientY: latestExternalDragRef.current.clientY,
        sourceKind: latestExternalDragRef.current.sourceKind,
      });
    }

    const dropPosition = coordinator.lastPosition
      ?? latestExternalPositionRef.current
      ?? coordinator.update({
        clientX: event.clientX,
        clientY: event.clientY,
        sourceKind: inferDragKind(event),
      });

    latestExternalDragRef.current = null;
    latestExternalPositionRef.current = null;
    coordinator.end();

    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0 && dataRef.current) {
      const { time, trackId: dropTrackId } = dropPosition;

      const defaultClipDuration = 5;
      let timeOffset = 0;

      for (const file of files) {
        const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
        const kind: TrackKind = ['.mp3', '.wav', '.aac', '.m4a'].includes(ext) ? 'audio' : 'visual';
        const isImageFile = file.type.startsWith('image/')
          || ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'].includes(ext);
        let compatibleTrackId = getCompatibleTrackId(dataRef.current.tracks, dropTrackId, kind, selectedTrackId);
        // Create a new track if none is compatible
        if (!compatibleTrackId) {
          const existingCount = dataRef.current.tracks.filter((t) => t.kind === kind).length;
          compatibleTrackId = `${kind === 'audio' ? 'A' : 'V'}${existingCount + 1}`;
          dataRef.current.tracks.push({
            id: compatibleTrackId,
            kind,
            label: `${kind === 'audio' ? 'Audio' : 'Visual'} ${existingCount + 1}`,
          });
          dataRef.current.rows.push({ id: compatibleTrackId, actions: [] });
        }

        const clipTime = time + timeOffset;
        timeOffset += defaultClipDuration;

        const skeletonId = `uploading-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const skeletonMeta: ClipMeta = {
          asset: `uploading:${file.name}`,
          track: compatibleTrackId,
          clipType: kind === 'audio' ? 'media' : 'hold',
          hold: kind === 'audio' ? undefined : defaultClipDuration,
          from: kind === 'audio' ? 0 : undefined,
          to: kind === 'audio' ? defaultClipDuration : undefined,
        };
        const skeletonAction: TimelineAction = {
          id: skeletonId,
          start: clipTime,
          end: clipTime + defaultClipDuration,
          effectId: `effect-${skeletonId}`,
        };

        const nextRows = dataRef.current.rows.map((row) =>
          row.id === compatibleTrackId
            ? { ...row, actions: [...row.actions, skeletonAction] }
            : row,
        );
        applyTimelineEdit(nextRows, { [skeletonId]: skeletonMeta }, undefined, undefined, { save: false });

        void (async () => {
          try {
            if (isImageFile) {
              const generationData = await uploadImageGeneration(file);
              const current = dataRef.current!;
              const cleanRows = current.rows.map((row) => ({
                ...row,
                actions: row.actions.filter((action) => action.id !== skeletonId),
              }));
              applyTimelineEdit(cleanRows, undefined, [skeletonId]);
              const assetId = registerGenerationAsset(generationData);
              if (assetId) {
                handleAssetDrop(assetId, compatibleTrackId, clipTime);
              }
              return;
            }

            const result = await uploadAsset(file);
            const src = await resolveAssetUrl(result.entry.file);
            patchRegistry(result.assetId, result.entry, src);
            const current = dataRef.current!;
            const cleanRows = current.rows.map((row) => ({
              ...row,
              actions: row.actions.filter((action) => action.id !== skeletonId),
            }));
            applyTimelineEdit(cleanRows, undefined, [skeletonId]);
            handleAssetDrop(result.assetId, compatibleTrackId, clipTime);
            void invalidateAssetRegistry();
          } catch (error) {
            console.error('[drop] Upload failed:', error);
            const current = dataRef.current!;
            const cleanRows = current.rows.map((row) => ({
              ...row,
              actions: row.actions.filter((action) => action.id !== skeletonId),
            }));
            applyTimelineEdit(cleanRows, undefined, [skeletonId], undefined, { save: false });
          }
        })();
      }
      return;
    }

    // When dropping in the "new track" zone, pass undefined trackId to force
    // handleAssetDrop to create a new track instead of reusing an existing one.
    const resolvedDropTrackId = dropPosition.isNewTrack ? undefined : dropPosition.trackId;

    const generationData = getGenerationDropData(event);
    if (generationData && dataRef.current) {
      const assetId = registerGenerationAsset(generationData);
      if (assetId) {
        handleAssetDrop(assetId, resolvedDropTrackId, dropPosition.time, dropPosition.isNewTrack);
      }
      return;
    }

    const assetKey = event.dataTransfer.getData('asset-key');
    const assetKind = event.dataTransfer.getData('asset-kind') as TrackKind;
    if (!assetKey || !dataRef.current) {
      return;
    }

    if (dropPosition.isNewTrack) {
      handleAssetDrop(assetKey, undefined, dropPosition.time, true);
      return;
    }

    const compatibleTrackId = getCompatibleTrackId(
      dataRef.current.tracks,
      dropPosition.trackId,
      assetKind || 'visual',
      selectedTrackId,
    );
    if (!compatibleTrackId) return;
    handleAssetDrop(assetKey, compatibleTrackId, dropPosition.time);
  }, [
    applyTimelineEdit,
    coordinator,
    dataRef,
    handleAssetDrop,
    invalidateAssetRegistry,
    patchRegistry,
    registerGenerationAsset,
    resolveAssetUrl,
    selectedTrackId,
    uploadAsset,
    uploadImageGeneration,
  ]);

  return {
    onTimelineDragOver,
    onTimelineDragLeave,
    onTimelineDrop,
  };
}
