import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  getDragType,
  getGenerationDropData,
  isFileDrag,
  type GenerationDropData,
  type DragType,
} from '@/shared/lib/dnd/dragDrop';
import { isVideoGeneration } from '@/shared/lib/typeGuards';
import { useAppEventListener } from '@/shared/lib/typedEvents';
import type { Shot } from '@/domains/generation/types';
import type { PendingSkeletonShot } from '@/tools/travel-between-images/components/VideoGallery/components/ShotListDisplayStates';

interface UsePendingNewShotDropParams {
  currentShotIds: string[];
  shots: Shot[] | undefined;
  onGenerationDropForNewShot?: (data: GenerationDropData) => Promise<void>;
  onFilesDropForNewShot?: (files: File[]) => Promise<void>;
  onSkeletonSetupReady?: (setup: (imageCount: number) => void, clear: () => void) => void;
}

interface UsePendingNewShotDropResult {
  isNewShotDropTarget: boolean;
  newShotDropType: DragType;
  isNewShotProcessing: boolean;
  pendingSkeletonShot: PendingSkeletonShot | null;
  newlyCreatedShotId: string | null;
  newlyCreatedShotExpectedImages: number;
  newlyCreatedShotBaselineNonVideoCount: number;
  clearNewlyCreatedShot: () => void;
  handleNewShotDragEnter: (e: React.DragEvent) => void;
  handleNewShotDragOver: (e: React.DragEvent) => void;
  handleNewShotDragLeave: (e: React.DragEvent) => void;
  handleNewShotDrop: (e: React.DragEvent) => Promise<void>;
}

export function usePendingNewShotDrop({
  currentShotIds,
  shots,
  onGenerationDropForNewShot,
  onFilesDropForNewShot,
  onSkeletonSetupReady,
}: UsePendingNewShotDropParams): UsePendingNewShotDropResult {
  const [isNewShotDropTarget, setIsNewShotDropTarget] = useState(false);
  const [newShotDropType, setNewShotDropType] = useState<DragType>('none');
  const [newlyCreatedShotId, setNewlyCreatedShotId] = useState<string | null>(null);
  const [newlyCreatedShotExpectedImages, setNewlyCreatedShotExpectedImages] = useState(0);
  const [newlyCreatedShotBaselineNonVideoCount, setNewlyCreatedShotBaselineNonVideoCount] = useState(0);

  const pendingNewShotCountRef = useRef(0);
  const baselineShotIdsRef = useRef<Set<string> | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentShotIdsKey = useMemo(() => currentShotIds.join('|'), [currentShotIds]);

  const clearPendingNewShot = useCallback(() => {
    pendingNewShotCountRef.current = 0;
    baselineShotIdsRef.current = null;
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, []);

  const setupPendingNewShot = useCallback(
    (imageCount: number) => {
      baselineShotIdsRef.current = new Set(currentShotIds);
      pendingNewShotCountRef.current = imageCount;

      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = setTimeout(() => {
        pendingNewShotCountRef.current = 0;
        baselineShotIdsRef.current = null;
        safetyTimeoutRef.current = null;
      }, 15000);
    },
    [currentShotIds],
  );

  useEffect(() => {
    return () => {
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!baselineShotIdsRef.current) return;
    const baseline = baselineShotIdsRef.current;
    const newShotId = currentShotIds.find((id) => !baseline.has(id));
    if (!newShotId) return;

    const expectedImages = pendingNewShotCountRef.current;
    const newShot = shots?.find((s) => s.id === newShotId);
    const existingNonVideoCount = (newShot?.images || []).filter((img) => !isVideoGeneration(img)).length;
    const remainingExpectedImages = Math.max(0, expectedImages - existingNonVideoCount);

    setNewlyCreatedShotId(newShotId);
    setNewlyCreatedShotExpectedImages(remainingExpectedImages);
    setNewlyCreatedShotBaselineNonVideoCount(existingNonVideoCount);

    clearPendingNewShot();
  }, [currentShotIds, currentShotIdsKey, shots, clearPendingNewShot]);

  const pendingSkeletonShot = useMemo(() => {
    if (!baselineShotIdsRef.current) return null;
    const baseline = baselineShotIdsRef.current;
    const newShotAlreadyInData = currentShotIds.some((id) => !baseline.has(id));
    if (newShotAlreadyInData) return null;
    return { imageCount: pendingNewShotCountRef.current };
  }, [currentShotIds, currentShotIdsKey]);

  useEffect(() => {
    if (onSkeletonSetupReady) {
      onSkeletonSetupReady(setupPendingNewShot, clearPendingNewShot);
    }
  }, [onSkeletonSetupReady, setupPendingNewShot, clearPendingNewShot]);

  const handlePendingCreate = useCallback(
    (detail: { imageCount: number }) => {
      setupPendingNewShot(detail.imageCount);
    },
    [setupPendingNewShot],
  );

  const handlePendingCreateClear = useCallback(() => {
    clearPendingNewShot();
  }, [clearPendingNewShot]);

  useAppEventListener('shot-pending-create', handlePendingCreate);
  useAppEventListener('shot-pending-create-clear', handlePendingCreateClear);

  const handleNewShotDragEnter = useCallback(
    (e: React.DragEvent) => {
      const dragType = getDragType(e);
      if (dragType !== 'none' && (onGenerationDropForNewShot || onFilesDropForNewShot)) {
        e.preventDefault();
        e.stopPropagation();
        setIsNewShotDropTarget(true);
        setNewShotDropType(dragType);
      }
    },
    [onGenerationDropForNewShot, onFilesDropForNewShot],
  );

  const handleNewShotDragOver = useCallback(
    (e: React.DragEvent) => {
      const dragType = getDragType(e);
      if (dragType !== 'none' && (onGenerationDropForNewShot || onFilesDropForNewShot)) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
        setIsNewShotDropTarget(true);
        setNewShotDropType(dragType);
      }
    },
    [onGenerationDropForNewShot, onFilesDropForNewShot],
  );

  const handleNewShotDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsNewShotDropTarget(false);
      setNewShotDropType('none');
    }
  }, []);

  const handleNewShotDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsNewShotDropTarget(false);
      setNewShotDropType('none');

      const generationData = getGenerationDropData(e);
      if (generationData && onGenerationDropForNewShot) {
        setupPendingNewShot(1);
        try {
          await onGenerationDropForNewShot(generationData);
        } catch (error) {
          normalizeAndPresentError(error, { context: 'ShotDrop', toastTitle: 'Failed to create shot' });
          clearPendingNewShot();
        }
        return;
      }

      if (isFileDrag(e) && onFilesDropForNewShot) {
        const files = Array.from(e.dataTransfer.files);
        const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
        const validFiles = files.filter((file) => validImageTypes.includes(file.type));

        if (validFiles.length === 0) {
          toast.error('No valid image files. Only JPEG, PNG, and WebP are supported.');
          return;
        }

        setupPendingNewShot(validFiles.length);
        try {
          await onFilesDropForNewShot(validFiles);
        } catch (error) {
          normalizeAndPresentError(error, { context: 'ShotDrop', toastTitle: 'Failed to create shot' });
          clearPendingNewShot();
        }
      }
    },
    [
      onGenerationDropForNewShot,
      onFilesDropForNewShot,
      setupPendingNewShot,
      clearPendingNewShot,
    ],
  );

  const clearNewlyCreatedShot = useCallback(() => {
    setNewlyCreatedShotId(null);
    setNewlyCreatedShotExpectedImages(0);
    setNewlyCreatedShotBaselineNonVideoCount(0);
  }, []);

  return {
    isNewShotDropTarget,
    newShotDropType,
    isNewShotProcessing: false,
    pendingSkeletonShot,
    newlyCreatedShotId,
    newlyCreatedShotExpectedImages,
    newlyCreatedShotBaselineNonVideoCount,
    clearNewlyCreatedShot,
    handleNewShotDragEnter,
    handleNewShotDragOver,
    handleNewShotDragLeave,
    handleNewShotDrop,
  };
}
