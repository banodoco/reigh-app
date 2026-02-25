/**
 * Hook for managing segment slot lightbox state.
 * Composes three responsibilities:
 * - deep-link synchronization
 * - pair/slot domain computation
 * - presentation adapter for SegmentSlotModeData
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import type { PairData } from '../../Timeline/TimelineContainer';
import { usePairData } from './usePairData';
import { useFrameCountUpdater } from './useFrameCountUpdater';
import type {
  SegmentSlotState,
  UseSegmentSlotModeResolvedProps,
  UseSegmentSlotModeReturn,
} from './segmentSlotContracts';
import { parseSegmentSlotLocationState } from './segmentSlotContracts';
import { useSegmentSlotDeepLinking } from './useSegmentSlotDeepLinking';
import {
  buildSegmentSlotIndexMap,
  buildTrailingPairData,
  useSegmentSlotPresentationAdapter,
} from './useSegmentSlotPresentationAdapter';

export type UseSegmentSlotModeProps = UseSegmentSlotModeResolvedProps;

export function useSegmentSlotMode(props: UseSegmentSlotModeProps): UseSegmentSlotModeReturn {
  const location = useLocation();

  const initialState = parseSegmentSlotLocationState(location.state);
  const [segmentSlotLightboxIndex, setSegmentSlotLightboxIndex] = useState<number | null>(null);
  const [activePairData, setActivePairData] = useState<PairData | null>(null);
  const [pendingImageToOpen, setPendingImageToOpen] = useState<string | null>(
    initialState.openImageGenerationId ?? null,
  );
  const [pendingImageVariantId, setPendingImageVariantId] = useState<string | null>(
    initialState.openImageVariantId ?? null,
  );
  const frameCountDebounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => () => {
    if (frameCountDebounceRef.current) {
      clearTimeout(frameCountDebounceRef.current);
      frameCountDebounceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!pendingImageToOpen) {
      setPendingImageVariantId(null);
    }
  }, [pendingImageToOpen]);

  const { pairDataByIndex } = usePairData({
    shotGenerations: props.shotGenerations,
    generationMode: props.effectiveGenerationMode,
    batchVideoFrames: props.batchVideoFrames,
  });

  const { updatePairFrameCount } = useFrameCountUpdater({
    shotId: props.selectedShotId,
    shotGenerations: props.shotGenerations,
    generationMode: props.effectiveGenerationMode,
    maxFrameLimit: props.maxFrameLimit,
    loadPositions: props.loadPositions,
    trailingFrameUpdateRef: props.trailingFrameUpdateRef,
  });

  const state: SegmentSlotState = useMemo(() => ({
    segmentSlotLightboxIndex,
    setSegmentSlotLightboxIndex,
    activePairData,
    setActivePairData,
    pendingImageToOpen,
    setPendingImageToOpen,
    pendingImageVariantId,
    setPendingImageVariantId,
  }), [
    segmentSlotLightboxIndex,
    activePairData,
    pendingImageToOpen,
    pendingImageVariantId,
  ]);

  const trailingPairData = useMemo(() => buildTrailingPairData({
    pairDataByIndex,
    segmentSlots: props.segmentSlots,
    shotGenerations: props.shotGenerations,
  }), [pairDataByIndex, props.segmentSlots, props.shotGenerations]);

  const slotByIndex = useMemo(
    () => buildSegmentSlotIndexMap(props.segmentSlots),
    [props.segmentSlots],
  );

  useSegmentSlotDeepLinking({
    props,
    state,
    pairDataByIndex,
    slotByIndex,
  });

  const handlePairClick = useCallback((pairIndex: number, passedPairData?: PairData) => {
    const computedData = pairDataByIndex.get(pairIndex)
      || (pairIndex === pairDataByIndex.size ? trailingPairData : null);
    const pairData = (passedPairData?.startImage ? passedPairData : null)
      || computedData
      || passedPairData;
    if (pairData) {
      setActivePairData(pairData);
    }
    setSegmentSlotLightboxIndex(pairIndex);
  }, [pairDataByIndex, trailingPairData]);

  const segmentSlotModeData = useSegmentSlotPresentationAdapter({
    props,
    state,
    pairDataByIndex,
    slotByIndex,
    trailingPairData,
    updatePairFrameCount,
    frameCountDebounceRef,
  });

  return {
    segmentSlotLightboxIndex,
    setSegmentSlotLightboxIndex,
    activePairData,
    setActivePairData,
    pendingImageToOpen,
    setPendingImageToOpen,
    pendingImageVariantId,
    pairDataByIndex,
    segmentSlotModeData,
    handlePairClick,
    updatePairFrameCount,
  };
}
