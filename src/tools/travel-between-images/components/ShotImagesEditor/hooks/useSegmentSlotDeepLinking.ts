import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { PairData } from '../../Timeline/TimelineContainer';
import type { SegmentSlot } from '@/shared/hooks/segments';
import type { SegmentSlotState, UseSegmentSlotModeResolvedProps } from './segmentSlotContracts';
import { parseSegmentSlotLocationState } from './segmentSlotContracts';

interface UseSegmentSlotDeepLinkingInput {
  props: UseSegmentSlotModeResolvedProps;
  state: SegmentSlotState;
  pairDataByIndex: Map<number, PairData>;
  slotByIndex: Map<number, SegmentSlot>;
}

export function useSegmentSlotDeepLinking({
  props,
  state,
  pairDataByIndex,
  slotByIndex,
}: UseSegmentSlotDeepLinkingInput): void {
  const location = useLocation();
  const navigate = useNavigate();
  const isFirstMountRef = useRef(true);
  const navigateWithTransition = props.navigateWithTransition;

  const {
    segmentSlotLightboxIndex,
    setSegmentSlotLightboxIndex,
    setActivePairData,
    setPendingImageToOpen,
    setPendingImageVariantId,
  } = state;

  useEffect(() => {
    const wasFirstMount = isFirstMountRef.current;
    isFirstMountRef.current = false;

    const currentState = parseSegmentSlotLocationState(location.state);
    if (!currentState.openImageGenerationId) return;

    if (wasFirstMount) {
      navigate(location.pathname + location.hash, {
        replace: true,
        state: { fromShotClick: currentState.fromShotClick },
      });
      return;
    }

    if (segmentSlotLightboxIndex !== null) {
      setSegmentSlotLightboxIndex(null);
      setActivePairData(null);
    }

    navigateWithTransition(() => {
      setPendingImageToOpen(currentState.openImageGenerationId!);
      if (currentState.openImageVariantId) {
        setPendingImageVariantId(currentState.openImageVariantId);
      }
    });

    navigate(location.pathname + location.hash, {
      replace: true,
      state: { fromShotClick: currentState.fromShotClick },
    });
  }, [
    location.state,
    location.pathname,
    location.hash,
    navigate,
    navigateWithTransition,
    segmentSlotLightboxIndex,
    setSegmentSlotLightboxIndex,
    setActivePairData,
    setPendingImageToOpen,
    setPendingImageVariantId,
  ]);

  useEffect(() => {
    const currentState = parseSegmentSlotLocationState(location.state);
    if (!currentState.openSegmentSlot || pairDataByIndex.size === 0) return;

    for (const [pairIndex, pairData] of pairDataByIndex.entries()) {
      if (pairData.startImage?.id !== currentState.openSegmentSlot) continue;

      const matchingSlot = slotByIndex.get(pairIndex);
      const hasVideo = matchingSlot?.type === 'child' && matchingSlot.child?.location;
      if (!hasVideo) return;

      setActivePairData(pairData);
      setSegmentSlotLightboxIndex(pairIndex);
      navigate(location.pathname + location.hash, {
        replace: true,
        state: { fromShotClick: currentState.fromShotClick },
      });
      break;
    }
  }, [
    location.state,
    location.pathname,
    location.hash,
    navigate,
    pairDataByIndex,
    slotByIndex,
    setActivePairData,
    setSegmentSlotLightboxIndex,
  ]);
}
