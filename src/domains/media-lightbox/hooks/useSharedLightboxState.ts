/**
 * useSharedLightboxState
 *
 * Shared state orchestrator for ImageLightbox and VideoLightbox.
 */

import { useRef, useEffect, useCallback, useMemo } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import { useVariants } from '@/shared/hooks/variants/useVariants';
import { useVariantSelection } from './useVariantSelection';
import { useVariantPromotion } from './useVariantPromotion';
import { useStarToggle } from './useStarToggle';
import { useReferences } from './useReferences';
import { useJoinClips } from './useJoinClips';
import { useGenerationLineage } from './useGenerationLineage';
import { useShotPositioning } from './useShotPositioning';
import { useShotCreation } from './useShotCreation';
import { useSourceGeneration } from './useSourceGeneration';
import { useMakeMainVariant } from './useMakeMainVariant';
import { useLightboxNavigation } from './useLightboxNavigation';
import { useSwipeNavigation } from './useSwipeNavigation';
import { useEffectiveMedia } from './useEffectiveMedia';
import { useLayoutMode } from './useLayoutMode';
import { invokeLightboxDelete } from '../utils/lightboxDelete';
import type {
  InteractionState,
  LightboxButtonGroupProps,
  SharedLightboxButtonGroupProps,
  SharedLightboxCoreProps,
  SharedLightboxNavigationProps,
  SharedLightboxShotProps,
  UseSharedLightboxStateInput,
  UseSharedLightboxStateReturn,
  VariantsStateResult,
} from './types';

export type { LightboxButtonGroupProps } from './types';

// --- Variants state ---

function useSharedVariantsState(core: SharedLightboxCoreProps): VariantsStateResult {
  const {
    media,
    isFormOnlyMode,
    variantFetchGenerationId,
    initialVariantId,
    selectedProjectId,
  } = core;
  const {
    variants,
    primaryVariant,
    activeVariant,
    isLoading: isLoadingVariants,
    setActiveVariantId: rawSetActiveVariantId,
    refetch: refetchVariants,
    setPrimaryVariant,
    deleteVariant,
  } = useVariants({
    generationId: variantFetchGenerationId,
    enabled: !isFormOnlyMode,
  });
  const { setActiveVariantId: baseSetActiveVariantId, isViewingNonPrimaryVariant } = useVariantSelection({
    media,
    viewedGenerationId: variantFetchGenerationId,
    rawSetActiveVariantId,
    activeVariant,
    variants,
    initialVariantId,
  });
  const intendedActiveVariantIdRef = useRef<string | null>(activeVariant?.id || null);
  const {
    promoteSuccess,
    isPromoting,
    handlePromoteToGeneration,
    handleAddVariantAsNewGenerationToShot,
  } = useVariantPromotion({
    selectedProjectId,
  });

  useEffect(() => {
    if (activeVariant?.id && activeVariant.id !== intendedActiveVariantIdRef.current) {
      intendedActiveVariantIdRef.current = activeVariant.id;
    }
  }, [activeVariant?.id]);

  const setActiveVariantId = useCallback((variantId: string) => {
    intendedActiveVariantIdRef.current = variantId;
    baseSetActiveVariantId(variantId);
  }, [baseSetActiveVariantId]);

  return {
    section: {
      list: variants || [],
      primaryVariant,
      activeVariant,
      isLoading: isLoadingVariants,
      setActiveVariantId,
      refetch: refetchVariants,
      setPrimaryVariant,
      deleteVariant,
      isViewingNonPrimaryVariant,
      promoteSuccess,
      isPromoting,
      handlePromoteToGeneration,
      handleAddVariantAsNewGenerationToShot,
    },
    intendedActiveVariantIdRef,
    activeVariant,
    primaryVariant,
    isViewingNonPrimaryVariant,
    setPrimaryVariant,
    refetchVariants,
  };
}

// --- Interaction state (star, references, lineage, shots, source generation, make-main-variant) ---

function useLightboxShotActions(
  core: SharedLightboxCoreProps,
  shots: SharedLightboxShotProps,
): UseSharedLightboxStateReturn['shots'] {
  const { media, selectedProjectId, onClose } = core;
  const {
    allShots,
    onNavigateToShot,
    onShotChange,
    selectedShotId,
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onAddToShot,
    onAddToShotWithoutPosition,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
  } = shots;
  const {
    isCreatingShot,
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
  } = useShotCreation({
    media,
    selectedProjectId,
    allShots: allShots || [],
    onNavigateToShot,
    onClose,
    onShotChange,
  });
  const computedPositionedInSelectedShot = useMemo(() => (
    typeof positionedInSelectedShot === 'boolean' ? positionedInSelectedShot : undefined
  ), [positionedInSelectedShot]);
  const {
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
  } = useShotPositioning({
    media,
    selectedShotId,
    allShots: allShots || [],
    positionedInSelectedShot: computedPositionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onNavigateToShot,
    onClose,
    onAddToShot,
    onAddToShotWithoutPosition,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
  });

  return {
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
    isCreatingShot,
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
  };
}

function useSharedMakeMainVariantState(params: {
  media: GenerationRow;
  sourceGenerationData: GenerationRow | null;
  isViewingNonPrimaryVariant: boolean;
  activeVariant: GenerationVariant | null;
  setPrimaryVariant: (id: string) => Promise<void>;
  refetchVariants: () => void;
  shotId?: string;
  selectedShotId?: string;
  onClose: () => void;
}): UseSharedLightboxStateReturn['makeMainVariant'] {
  const {
    media,
    sourceGenerationData,
    isViewingNonPrimaryVariant,
    activeVariant,
    setPrimaryVariant,
    refetchVariants,
    shotId,
    selectedShotId,
    onClose,
  } = params;
  const canMakeMainVariantFromChild = !!sourceGenerationData && !!media.location;
  const canMakeMainVariantFromVariant = isViewingNonPrimaryVariant && !!activeVariant?.location;
  const canMakeMainVariant = canMakeMainVariantFromChild || canMakeMainVariantFromVariant;
  const { isMakingMainVariant, handleMakeMainVariant } = useMakeMainVariant({
    media,
    sourceGenerationData,
    canMakeMainVariantFromChild,
    canMakeMainVariantFromVariant,
    activeVariant,
    setPrimaryVariant,
    refetchVariants,
    shotId,
    selectedShotId,
    onClose,
  });

  return {
    canMake: canMakeMainVariant,
    canMakeFromChild: canMakeMainVariantFromChild,
    canMakeFromVariant: canMakeMainVariantFromVariant,
    isMaking: isMakingMainVariant,
    handle: handleMakeMainVariant,
  };
}

function useInteractionState(
  input: UseSharedLightboxStateInput,
  variantsState: VariantsStateResult,
): InteractionState {
  const star = useStarToggle({
    media: input.core.media,
    starred: input.starred,
    shotId: input.shots.shotId,
  });
  const referencesState = useReferences({
    media: input.core.media,
    selectedProjectId: input.core.selectedProjectId,
    isVideo: input.core.isVideo,
    selectedShotId: input.shots.selectedShotId,
  });
  const joinState = useJoinClips({
    media: input.core.media,
    isVideo: input.core.isVideo,
    selectedProjectId: input.core.selectedProjectId,
  });
  const lineageState = useGenerationLineage({
    media: input.core.media,
    enabled: !input.core.isFormOnlyMode,
  });
  const shots = useLightboxShotActions(input.core, input.shots);
  const { sourceGenerationData, sourcePrimaryVariant } = useSourceGeneration({
    media: input.core.media,
    onOpenExternalGeneration: input.onOpenExternalGeneration,
  });
  const makeMainVariant = useSharedMakeMainVariantState({
    media: input.core.media,
    sourceGenerationData,
    isViewingNonPrimaryVariant: variantsState.isViewingNonPrimaryVariant,
    activeVariant: variantsState.activeVariant,
    setPrimaryVariant: variantsState.setPrimaryVariant,
    refetchVariants: variantsState.refetchVariants,
    shotId: input.shots.shotId,
    selectedShotId: input.shots.selectedShotId,
    onClose: input.core.onClose,
  });

  return {
    star: {
      localStarred: star.localStarred,
      setLocalStarred: star.setLocalStarred,
      toggleStarMutation: star.toggleStarMutation,
      handleToggleStar: star.handleToggleStar,
    },
    references: {
      isAddingToReferences: referencesState.isAddingToReferences,
      addToReferencesSuccess: referencesState.addToReferencesSuccess,
      handleAddToReferences: referencesState.handleAddToReferences,
      isAddingToJoin: joinState.isAddingToJoin,
      addToJoinSuccess: joinState.addToJoinSuccess,
      handleAddToJoin: joinState.handleAddToJoin,
      handleGoToJoin: joinState.handleGoToJoin,
    },
    lineage: {
      derivedItems: lineageState.derivedItems || [],
      derivedGenerations: lineageState.derivedGenerations || [],
      derivedPage: lineageState.derivedPage,
      derivedTotalPages: lineageState.derivedTotalPages,
      paginatedDerived: lineageState.paginatedDerived || [],
      setDerivedPage: lineageState.setDerivedPage,
    },
    shots,
    sourceGeneration: {
      data: sourceGenerationData,
      primaryVariant: sourcePrimaryVariant,
    },
    makeMainVariant,
  };
}

// --- Presentation state (navigation, layout, effective media, button groups) ---

function useLightboxNavigationModel(
  core: SharedLightboxCoreProps,
  navigation: SharedLightboxNavigationProps,
) {
  const { onClose, readOnly } = core;
  const {
    hasNext = false,
    hasPrevious = false,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeDisabled,
    showNavigation,
  } = navigation;
  const { safeClose, activateClickShield } = useLightboxNavigation({
    onNext: handleSlotNavNext,
    onPrevious: handleSlotNavPrev,
    onClose,
  });
  const swipeNavigation = useSwipeNavigation({
    onSwipeLeft: () => {
      if (hasNext) handleSlotNavNext();
    },
    onSwipeRight: () => {
      if (hasPrevious) handleSlotNavPrev();
    },
    disabled: swipeDisabled || readOnly || !showNavigation,
    hasNext,
    hasPrevious,
    threshold: 50,
    velocityThreshold: 0.3,
  });

  return {
    safeClose,
    activateClickShield,
    swipeNavigation,
  };
}

function useSharedButtonGroupState(params: {
  core: SharedLightboxCoreProps;
  actions: SharedLightboxButtonGroupProps;
  localStarred: boolean;
  handleToggleStar: () => void;
  toggleStarPending: boolean;
  isAddingToReferences: boolean;
  addToReferencesSuccess: boolean;
  handleAddToReferences: () => Promise<void>;
  handleAddToJoin: () => void;
  isAddingToJoin: boolean;
  addToJoinSuccess: boolean;
  handleGoToJoin: () => void;
}) {
  const {
    core,
    actions,
    localStarred,
    handleToggleStar,
    toggleStarPending,
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
    handleAddToJoin,
    isAddingToJoin,
    addToJoinSuccess,
    handleGoToJoin,
  } = params;
  const { media, onClose } = core;
  const {
    showDownload,
    isDownloading,
    onDelete,
    isDeleting,
    isUpscaling,
    handleUpscale,
  } = actions;
  const handleDelete = useCallback(async () => {
    if (!onDelete) return;
    await invokeLightboxDelete(onDelete, media.id, 'MediaLightbox.delete');
  }, [onDelete, media.id]);

  return useMemo<LightboxButtonGroupProps>(() => ({
    topRight: {
      showDownload: !!showDownload,
      isDownloading,
      onDelete,
      handleDelete,
      isDeleting,
      onClose,
    },
    bottomLeft: {
      isUpscaling,
      handleUpscale: async () => {
        await Promise.resolve(handleUpscale());
      },
      localStarred,
      handleToggleStar,
      toggleStarPending,
    },
    bottomRight: {
      isAddingToReferences,
      addToReferencesSuccess,
      handleAddToReferences,
      handleAddToJoin,
      isAddingToJoin,
      addToJoinSuccess,
      onGoToJoin: handleGoToJoin,
    },
  }), [
    showDownload,
    isDownloading,
    onDelete,
    handleDelete,
    isDeleting,
    onClose,
    isUpscaling,
    handleUpscale,
    localStarred,
    handleToggleStar,
    toggleStarPending,
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
    handleAddToJoin,
    isAddingToJoin,
    addToJoinSuccess,
    handleGoToJoin,
  ]);
}

function usePresentationState(
  input: UseSharedLightboxStateInput,
  variantsState: VariantsStateResult,
  interactionState: InteractionState,
) {
  const navigation = useLightboxNavigationModel(input.core, input.navigation);
  const { effectiveVideoUrl, effectiveMediaUrl, effectiveImageDimensions } = useEffectiveMedia({
    isVideo: input.core.isVideo,
    activeVariant: variantsState.activeVariant,
    effectiveImageUrl: input.media.effectiveImageUrl,
    imageDimensions: input.media.imageDimensions,
    projectAspectRatio: input.media.projectAspectRatio,
  });
  const layout = useLayoutMode({
    isMobile: input.core.isMobile,
    showTaskDetails: input.layout.showTaskDetails ?? false,
    isSpecialEditMode: input.layout.isSpecialEditMode,
    isVideo: input.core.isVideo,
    isInpaintMode: input.layout.isInpaintMode ?? false,
    isMagicEditMode: input.layout.isMagicEditMode ?? false,
  });
  const buttonGroupProps = useSharedButtonGroupState({
    core: input.core,
    actions: input.actions,
    localStarred: interactionState.star.localStarred,
    handleToggleStar: interactionState.star.handleToggleStar,
    toggleStarPending: interactionState.star.toggleStarMutation.isPending,
    isAddingToReferences: interactionState.references.isAddingToReferences,
    addToReferencesSuccess: interactionState.references.addToReferencesSuccess,
    handleAddToReferences: interactionState.references.handleAddToReferences,
    handleAddToJoin: interactionState.references.handleAddToJoin,
    isAddingToJoin: interactionState.references.isAddingToJoin,
    addToJoinSuccess: interactionState.references.addToJoinSuccess,
    handleGoToJoin: interactionState.references.handleGoToJoin,
  });

  return {
    variants: variantsState.section,
    intendedActiveVariantIdRef: variantsState.intendedActiveVariantIdRef,
    navigation,
    effectiveMedia: {
      videoUrl: effectiveVideoUrl,
      mediaUrl: effectiveMediaUrl,
      imageDimensions: effectiveImageDimensions,
    },
    layout: {
      isTabletOrLarger: layout.isTabletOrLarger,
      isTouchLikeDevice: layout.isTouchLikeDevice,
      shouldShowSidePanel: layout.shouldShowSidePanel,
      isUnifiedEditMode: layout.isUnifiedEditMode,
      isPortraitMode: layout.isPortraitMode,
    },
    buttonGroupProps,
  };
}

// --- Main orchestrator ---

export function useSharedLightboxState(input: UseSharedLightboxStateInput): UseSharedLightboxStateReturn {
  const variantsState = useSharedVariantsState(input.core);
  const interactionState = useInteractionState(input, variantsState);
  const presentationState = usePresentationState(input, variantsState, interactionState);

  return {
    variants: presentationState.variants,
    intendedActiveVariantIdRef: presentationState.intendedActiveVariantIdRef,
    navigation: presentationState.navigation,
    star: interactionState.star,
    references: interactionState.references,
    lineage: interactionState.lineage,
    shots: interactionState.shots,
    sourceGeneration: interactionState.sourceGeneration,
    makeMainVariant: interactionState.makeMainVariant,
    effectiveMedia: presentationState.effectiveMedia,
    layout: presentationState.layout,
    buttonGroupProps: presentationState.buttonGroupProps,
  };
}
