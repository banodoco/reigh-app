import { useState, useCallback, useEffect, useRef } from 'react';
import type { Shot } from '@/domains/generation/types';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { isValidDropTarget, getGenerationDropData, isFileDrag, type GenerationDropData } from '@/shared/lib/dnd/dragDrop';
import { isVideoGeneration } from '@/shared/lib/typeGuards';
import { useAppEventListener } from '@/shared/lib/typedEvents';

export interface DropOptions {
  withoutPosition?: boolean;
}

interface UseSortableShotDropFeedbackParams {
  shot: Shot;
  onGenerationDrop?: (shotId: string, data: GenerationDropData, options?: DropOptions) => Promise<void>;
  onFilesDrop?: (shotId: string, files: File[], options?: DropOptions) => Promise<void>;
  initialPendingUploads?: number;
  initialPendingBaselineNonVideoCount?: number;
  onInitialPendingUploadsConsumed?: () => void;
}

export function useSortableShotDropFeedback({
  shot,
  onGenerationDrop,
  onFilesDrop,
  initialPendingUploads = 0,
  initialPendingBaselineNonVideoCount,
  onInitialPendingUploadsConsumed,
}: UseSortableShotDropFeedbackParams) {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [isOverWithoutPositionZone, setIsOverWithoutPositionZone] = useState(false);
  const [withoutPositionDropState, setWithoutPositionDropState] = useState<'idle' | 'loading' | 'success'>('idle');
  const [withPositionDropState, setWithPositionDropState] = useState<'idle' | 'loading' | 'success'>('idle');

  const withoutPositionZoneRef = useRef<HTMLDivElement>(null);
  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const withPositionSuccessTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const expectedNewCountRef = useRef(0);
  const baselineNonVideoIdsRef = useRef<Set<string> | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const latchedInitialPendingRef = useRef(0);
  const initialBaselineCountRef = useRef(0);
  const pendingUploadOperationRef = useRef<string | null>(null);

  const nonVideoImageIds = (shot.images || [])
    .filter(img => !isVideoGeneration(img))
    .map(img => img.id);
  const nonVideoImageCount = nonVideoImageIds.length;

  if (initialPendingUploads > 0 && latchedInitialPendingRef.current === 0) {
    latchedInitialPendingRef.current = initialPendingUploads;
    initialBaselineCountRef.current =
      typeof initialPendingBaselineNonVideoCount === 'number'
        ? initialPendingBaselineNonVideoCount
        : nonVideoImageCount;
  }

  let pendingSkeletonCount = 0;

  if (expectedNewCountRef.current > 0 && baselineNonVideoIdsRef.current) {
    const baseline = baselineNonVideoIdsRef.current;
    const newlyAppearedCount = nonVideoImageIds.filter(id => !baseline.has(id)).length;
    pendingSkeletonCount = Math.max(0, expectedNewCountRef.current - newlyAppearedCount);

    if (pendingSkeletonCount === 0) {
      expectedNewCountRef.current = 0;
      baselineNonVideoIdsRef.current = null;
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    }
  } else if (latchedInitialPendingRef.current > 0) {
    const newlyAppearedCount = nonVideoImageCount - initialBaselineCountRef.current;
    pendingSkeletonCount = Math.max(0, latchedInitialPendingRef.current - newlyAppearedCount);

    if (pendingSkeletonCount === 0) {
      latchedInitialPendingRef.current = 0;
      initialBaselineCountRef.current = 0;
    }
  }

  useEffect(() => {
    if (!onInitialPendingUploadsConsumed) return;
    if (latchedInitialPendingRef.current <= 0) return;
    const baseline = initialBaselineCountRef.current;
    const expected = latchedInitialPendingRef.current;
    if (nonVideoImageCount >= baseline + expected) {
      latchedInitialPendingRef.current = 0;
      initialBaselineCountRef.current = 0;
      onInitialPendingUploadsConsumed();
    }
  }, [nonVideoImageCount, onInitialPendingUploadsConsumed]);

  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
      if (withPositionSuccessTimeoutRef.current) {
        clearTimeout(withPositionSuccessTimeoutRef.current);
      }
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
      }
    };
  }, []);

  const canAcceptDrop = useCallback((e: React.DragEvent): boolean => {
    return isValidDropTarget(e) && (!!onGenerationDrop || !!onFilesDrop);
  }, [onGenerationDrop, onFilesDrop]);

  const handlePendingUpload = useCallback((detail: { shotId: string; expectedCount: number; operationId: string }) => {
    const { shotId, expectedCount, operationId } = detail;
    if (shotId !== shot.id) return;

    pendingUploadOperationRef.current = operationId;
    setWithPositionDropState('loading');

    baselineNonVideoIdsRef.current = new Set(nonVideoImageIds);
    expectedNewCountRef.current = expectedCount;

    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    safetyTimeoutRef.current = setTimeout(() => {
      expectedNewCountRef.current = 0;
      baselineNonVideoIdsRef.current = null;
      pendingUploadOperationRef.current = null;
      setWithPositionDropState('idle');
      safetyTimeoutRef.current = null;
    }, 10000);
  }, [shot.id, nonVideoImageIds]);

  const handlePendingUploadSucceeded = useCallback((detail: { shotId: string; operationId: string }) => {
    if (detail.shotId !== shot.id) return;
    if (pendingUploadOperationRef.current !== detail.operationId) return;

    pendingUploadOperationRef.current = null;
    setWithPositionDropState('success');
    if (withPositionSuccessTimeoutRef.current) clearTimeout(withPositionSuccessTimeoutRef.current);
    withPositionSuccessTimeoutRef.current = setTimeout(() => {
      setWithPositionDropState('idle');
      withPositionSuccessTimeoutRef.current = null;
    }, 1500);
  }, [shot.id]);

  const handlePendingUploadFailed = useCallback((detail: { shotId: string; operationId: string }) => {
    if (detail.shotId !== shot.id) return;
    if (pendingUploadOperationRef.current !== detail.operationId) return;

    pendingUploadOperationRef.current = null;
    setWithPositionDropState('idle');
    expectedNewCountRef.current = 0;
    baselineNonVideoIdsRef.current = null;
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, [shot.id]);

  useAppEventListener('shot-pending-upload', handlePendingUpload);
  useAppEventListener('shot-pending-upload-succeeded', handlePendingUploadSucceeded);
  useAppEventListener('shot-pending-upload-failed', handlePendingUploadFailed);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (canAcceptDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      setIsDropTarget(true);
    }
  }, [canAcceptDrop]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (canAcceptDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsDropTarget(true);
    }
  }, [canAcceptDrop]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDropTarget(false);
    }
  }, []);

  const finishWithoutPositionState = useCallback(() => {
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    successTimeoutRef.current = setTimeout(() => {
      setWithoutPositionDropState('idle');
      setIsDropTarget(false);
      successTimeoutRef.current = null;
    }, 1500);
  }, []);

  const finishWithPositionState = useCallback(() => {
    if (withPositionSuccessTimeoutRef.current) clearTimeout(withPositionSuccessTimeoutRef.current);
    withPositionSuccessTimeoutRef.current = setTimeout(() => {
      setWithPositionDropState('idle');
      withPositionSuccessTimeoutRef.current = null;
    }, 1500);
  }, []);

  const handleDropInternal = useCallback(async (e: React.DragEvent, withoutPosition: boolean) => {
    e.preventDefault();
    e.stopPropagation();

    if (!withoutPosition) {
      setIsDropTarget(false);
    }
    setIsOverWithoutPositionZone(false);

    const dropOptions: DropOptions = { withoutPosition };

    const generationData = getGenerationDropData(e);
    if (generationData && onGenerationDrop) {
      if (withoutPosition) {
        setWithoutPositionDropState('loading');
        try {
          await onGenerationDrop(shot.id, generationData, dropOptions);
          setWithoutPositionDropState('success');
          finishWithoutPositionState();
        } catch (error) {
          normalizeAndPresentError(error, { context: 'ShotDrop', showToast: false });
          setWithoutPositionDropState('idle');
          setIsDropTarget(false);
        }
      } else {
        setWithPositionDropState('loading');
        baselineNonVideoIdsRef.current = new Set(nonVideoImageIds);
        expectedNewCountRef.current = 1;

        if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = setTimeout(() => {
          expectedNewCountRef.current = 0;
          baselineNonVideoIdsRef.current = null;
          safetyTimeoutRef.current = null;
        }, 5000);

        try {
          await onGenerationDrop(shot.id, generationData, dropOptions);
          setWithPositionDropState('success');
          finishWithPositionState();
        } catch (error) {
          normalizeAndPresentError(error, { context: 'ShotDrop', showToast: false });
          setWithPositionDropState('idle');
          expectedNewCountRef.current = 0;
          baselineNonVideoIdsRef.current = null;
          if (safetyTimeoutRef.current) {
            clearTimeout(safetyTimeoutRef.current);
            safetyTimeoutRef.current = null;
          }
        }
      }
      return;
    }

    if (isFileDrag(e) && onFilesDrop) {
      const files = Array.from(e.dataTransfer.files);
      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const validFiles = files.filter(file => validImageTypes.includes(file.type));

      if (validFiles.length === 0) {
        setIsDropTarget(false);
        return;
      }

      if (withoutPosition) {
        setWithoutPositionDropState('loading');
        try {
          await onFilesDrop(shot.id, validFiles, dropOptions);
          setWithoutPositionDropState('success');
          finishWithoutPositionState();
        } catch (error) {
          normalizeAndPresentError(error, { context: 'ShotDrop', showToast: false });
          setWithoutPositionDropState('idle');
          setIsDropTarget(false);
        }
      } else {
        setWithPositionDropState('loading');
        baselineNonVideoIdsRef.current = new Set(nonVideoImageIds);
        expectedNewCountRef.current = validFiles.length;

        if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = setTimeout(() => {
          expectedNewCountRef.current = 0;
          baselineNonVideoIdsRef.current = null;
          safetyTimeoutRef.current = null;
        }, 10000);

        try {
          await onFilesDrop(shot.id, validFiles, dropOptions);
          setWithPositionDropState('success');
          finishWithPositionState();
        } catch (error) {
          normalizeAndPresentError(error, { context: 'ShotDrop', showToast: false });
          setWithPositionDropState('idle');
          expectedNewCountRef.current = 0;
          baselineNonVideoIdsRef.current = null;
          if (safetyTimeoutRef.current) {
            clearTimeout(safetyTimeoutRef.current);
            safetyTimeoutRef.current = null;
          }
        }
      }
    }
  }, [onGenerationDrop, onFilesDrop, shot.id, nonVideoImageIds, finishWithoutPositionState, finishWithPositionState]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    handleDropInternal(e, false);
  }, [handleDropInternal]);

  const handleWithoutPositionDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleDropInternal(e, true);
  }, [handleDropInternal]);

  const handleWithoutPositionDragEnter = useCallback((e: React.DragEvent) => {
    if (canAcceptDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      setIsOverWithoutPositionZone(true);
    }
  }, [canAcceptDrop]);

  const handleWithoutPositionDragOver = useCallback((e: React.DragEvent) => {
    if (canAcceptDrop(e)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsOverWithoutPositionZone(true);
    }
  }, [canAcceptDrop]);

  const handleWithoutPositionDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsOverWithoutPositionZone(false);
    }
  }, []);

  return {
    isDropTarget,
    isOverWithoutPositionZone,
    withoutPositionDropState,
    withPositionDropState,
    pendingSkeletonCount,
    withoutPositionZoneRef,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleWithoutPositionDrop,
    handleWithoutPositionDragEnter,
    handleWithoutPositionDragOver,
    handleWithoutPositionDragLeave,
  };
}
