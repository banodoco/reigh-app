import { useCallback, useEffect, useRef } from 'react';
import {
  getGenerationDropData,
  getMultiGenerationDropData,
  getDragType,
} from '@/shared/lib/dnd/dragDrop';
import { inferDragKind } from '@/tools/video-editor/lib/drop-position';
import type { DragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import type { UseAssetManagementResult } from '@/tools/video-editor/hooks/useAssetManagement';
import type {
  TimelineApplyEdit,
  TimelineInvalidateAssetRegistry,
  TimelinePatchRegistry,
  TimelineRegisterAsset,
  TimelineUploadAsset,
} from '@/tools/video-editor/hooks/timeline-state-types';
import { type TimelineData } from '@/tools/video-editor/lib/timeline-data';
import {
  finalizeExternalDrop,
  handleAssetDrop,
  handleEffectLayerDrop,
  handleFileDrop,
  handleMultiGenerationDrop,
  handleSingleGenerationDrop,
  handleTextToolDrop,
  isGenerationDragType,
  type TimelineDropPosition,
} from '@/tools/video-editor/lib/external-drop-utils';
import type { TrackKind } from '@/tools/video-editor/types';
import { createAutoScroller } from '@/tools/video-editor/lib/auto-scroll';

async function dispatchTimelineDrop({
  event,
  dataRef,
  pendingOpsRef,
  dropPosition,
  selectedTrackId,
  applyEdit,
  patchRegistry,
  uploadAsset,
  invalidateAssetRegistry,
  resolveAssetUrl,
  registerGenerationAsset,
  uploadImageGeneration,
  dropAsset,
  handleAddTextAt,
}: {
  event: React.DragEvent<HTMLDivElement>;
  dataRef: React.MutableRefObject<TimelineData | null>;
  pendingOpsRef: React.MutableRefObject<number>;
  dropPosition: TimelineDropPosition;
  selectedTrackId: string | null;
  applyEdit: TimelineApplyEdit;
  patchRegistry: TimelinePatchRegistry;
  uploadAsset: TimelineUploadAsset;
  invalidateAssetRegistry: TimelineInvalidateAssetRegistry;
  resolveAssetUrl: (file: string) => Promise<string>;
  registerGenerationAsset: UseAssetManagementResult['registerGenerationAsset'];
  uploadImageGeneration: UseAssetManagementResult['uploadImageGeneration'];
  dropAsset: UseAssetManagementResult['handleAssetDrop'];
  handleAddTextAt?: (trackId: string, time: number) => void;
}) {
  const insertAtTop = Boolean(dropPosition.isNewTrackTop);

  if (event.dataTransfer.types.includes('text-tool')) {
    handleTextToolDrop({ dataRef, dropPosition, insertAtTop, handleAddTextAt });
    return;
  }

  if (event.dataTransfer.types.includes('effect-layer')) {
    handleEffectLayerDrop({ dataRef, dropPosition, insertAtTop, selectedTrackId, applyEdit });
    return;
  }

  if (await handleFileDrop({
    files: Array.from(event.dataTransfer.files),
    dataRef,
    pendingOpsRef,
    dropPosition,
    insertAtTop,
    selectedTrackId,
    applyEdit,
    patchRegistry,
    uploadAsset,
    invalidateAssetRegistry,
    resolveAssetUrl,
    registerGenerationAsset,
    uploadImageGeneration,
    dropAsset,
  })) {
    return;
  }

  const multiGenerationData = getMultiGenerationDropData(event);
  if (multiGenerationData?.length) {
    handleMultiGenerationDrop({
      generationItems: multiGenerationData,
      dataRef,
      dropPosition,
      insertAtTop,
      registerGenerationAsset,
      patchRegistry,
      dropAsset,
    });
    return;
  }

  const generationData = getGenerationDropData(event);
  if (generationData) {
    handleSingleGenerationDrop({
      generationData,
      dataRef,
      dropPosition,
      insertAtTop,
      registerGenerationAsset,
      dropAsset,
    });
    return;
  }

  handleAssetDrop({
    assetKey: event.dataTransfer.getData('asset-key'),
    assetKind: event.dataTransfer.getData('asset-kind') as TrackKind,
    dataRef,
    dropPosition,
    insertAtTop,
    selectedTrackId,
    dropAsset,
  });
}

export interface UseExternalDropArgs {
  dataRef: React.MutableRefObject<TimelineData | null>;
  pendingOpsRef: React.MutableRefObject<number>;
  scale: number;
  scaleWidth: number;
  selectedTrackId: string | null;
  applyEdit: TimelineApplyEdit;
  patchRegistry: TimelinePatchRegistry;
  registerAsset: TimelineRegisterAsset;
  uploadAsset: TimelineUploadAsset;
  invalidateAssetRegistry: TimelineInvalidateAssetRegistry;
  resolveAssetUrl: (file: string) => Promise<string>;
  coordinator: DragCoordinator;
  registerGenerationAsset: UseAssetManagementResult['registerGenerationAsset'];
  uploadImageGeneration: UseAssetManagementResult['uploadImageGeneration'];
  handleAssetDrop: UseAssetManagementResult['handleAssetDrop'];
  handleAddTextAt?: (trackId: string, time: number) => void;
}

export interface UseExternalDropResult {
  onTimelineDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onTimelineDragLeave: (event: React.DragEvent<HTMLDivElement>) => void;
  onTimelineDrop: (event: React.DragEvent<HTMLDivElement>) => void;
}

export function useExternalDrop({
  dataRef,
  pendingOpsRef,
  selectedTrackId,
  applyEdit,
  patchRegistry,
  uploadAsset,
  invalidateAssetRegistry,
  resolveAssetUrl,
  coordinator,
  registerGenerationAsset,
  uploadImageGeneration,
  handleAssetDrop: dropAsset,
  handleAddTextAt,
}: UseExternalDropArgs): UseExternalDropResult {
  const externalDragFrameRef = useRef<number | null>(null);
  const autoScrollerRef = useRef<ReturnType<typeof createAutoScroller> | null>(null);
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
    autoScrollerRef.current?.stop();
    autoScrollerRef.current = null;
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
    if (!types.includes('asset-key')
      && !types.includes('text-tool')
      && !types.includes('effect-layer')
      && dragType !== 'file'
      && !isGenerationDragType(dragType)) {
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
    if (!autoScrollerRef.current && coordinator.editAreaRef.current) {
      autoScrollerRef.current = createAutoScroller(coordinator.editAreaRef.current, (clientX, clientY) => {
        const currentDrag = latestExternalDragRef.current;
        if (!currentDrag) {
          return;
        }

        latestExternalPositionRef.current = coordinator.update({
          clientX,
          clientY,
          sourceKind: currentDrag.sourceKind,
        });
      });
    }
    autoScrollerRef.current?.update(event.clientX, event.clientY);

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
    const dropPosition = finalizeExternalDrop({
      event,
      coordinator,
      autoScrollerRef,
      externalDragFrameRef,
      latestExternalDragRef,
      latestExternalPositionRef,
    });
    await dispatchTimelineDrop({
      event,
      dataRef,
      pendingOpsRef,
      dropPosition,
      selectedTrackId,
      applyEdit,
      patchRegistry,
      uploadAsset,
      invalidateAssetRegistry,
      resolveAssetUrl,
      registerGenerationAsset,
      uploadImageGeneration,
      dropAsset,
      handleAddTextAt,
    });
  }, [
    applyEdit,
    coordinator,
    dataRef,
    dropAsset,
    invalidateAssetRegistry,
    pendingOpsRef,
    patchRegistry,
    registerGenerationAsset,
    resolveAssetUrl,
    selectedTrackId,
    handleAddTextAt,
    uploadAsset,
    uploadImageGeneration,
  ]);

  return {
    onTimelineDragOver,
    onTimelineDragLeave,
    onTimelineDrop,
  };
}
