/**
 * useSharedLightboxState
 *
 * Consolidates hooks that are shared between ImageLightbox and VideoLightbox.
 * This forms the foundation for splitting MediaLightbox into media-type-specific
 * components while avoiding hook duplication.
 *
 * Included hooks (shared by both image and video):
 * - Variants: useVariants, useVariantSelection, useVariantPromotion
 * - Navigation: useLightboxNavigation, useSwipeNavigation
 * - Star toggle: useStarToggle
 * - References: useReferences, useJoinClips
 * - Lineage: useGenerationLineage
 * - Shot management: useShotPositioning, useShotCreation
 * - Source generation: useSourceGeneration
 * - Make main variant: useMakeMainVariant
 * - Effective media: useEffectiveMedia
 * - Layout mode: useLayoutMode
 * - Button group props
 *
 * NOT included (media-type specific):
 * - Image: useInpainting, useUpscale, useMagicEditMode, useRepositionMode, useImg2ImgMode
 * - Video: useLightboxVideoMode, useVideoRegenerateMode
 */

import { useRef, useEffect, useMemo, useCallback } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { GenerationRow, Shot } from '@/domains/generation/types';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import type { DerivedItem } from '@/domains/generation/hooks/useDerivedItems';
import type { SourceVariantData } from './useSourceGeneration';
import type { ShotOption, QuickCreateSuccess } from '../types';
import { useVariants } from '@/shared/hooks/useVariants';
import { useVariantSelection } from './useVariantSelection';
import { useVariantPromotion } from './useVariantPromotion';
import { useLightboxNavigation } from './useLightboxNavigation';
import { useSwipeNavigation } from './useSwipeNavigation';
import { useStarToggle } from './useStarToggle';
import { useReferences } from './useReferences';
import { useJoinClips } from './useJoinClips';
import { useGenerationLineage } from './useGenerationLineage';
import { useShotPositioning } from './useShotPositioning';
import { useShotCreation } from './useShotCreation';
import { useSourceGeneration } from './useSourceGeneration';
import { useMakeMainVariant } from './useMakeMainVariant';
import { useEffectiveMedia } from './useEffectiveMedia';
import { useLayoutMode } from './useLayoutMode';

// ============================================================================
// Props Sub-Interfaces (grouped by concern)
// ============================================================================

/** Core media and project context */
interface SharedLightboxCoreProps {
  media: GenerationRow;
  isVideo: boolean;
  selectedProjectId: string | null;
  isMobile: boolean;
  isFormOnlyMode: boolean;
  onClose: () => void;
  readOnly?: boolean;
  variantFetchGenerationId: string | null;
  initialVariantId?: string;
}

/** Navigation state and handlers */
interface SharedLightboxNavigationProps {
  showNavigation?: boolean;
  hasNext?: boolean;
  hasPrevious?: boolean;
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
  swipeDisabled: boolean;
}

/** Shot management callbacks and optimistic state */
interface SharedLightboxShotProps {
  shotId?: string;
  selectedShotId?: string;
  allShots?: ShotOption[];
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onNavigateToShot?: (shot: Shot, options?: { isNewlyCreated?: boolean }) => void;
  onShowTick?: (imageId: string) => void;
  onShowSecondaryTick?: (imageId: string) => void;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  positionedInSelectedShot?: boolean;
  associatedWithoutPositionInSelectedShot?: boolean;
}

/** Layout mode inputs (drives panel/edit mode visibility) */
interface SharedLightboxLayoutProps {
  showTaskDetails?: boolean;
  isSpecialEditMode: boolean;
  isInpaintMode: boolean;
  isMagicEditMode: boolean;
}

/** Button group inputs (download, delete, star, upscale, edit mode) */
interface SharedLightboxButtonGroupProps {
  isCloudMode: boolean;
  showDownload?: boolean;
  isDownloading: boolean;
  setIsDownloading: (v: boolean) => void;
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  isUpscaling: boolean;
  handleUpscale: () => void;
}

/** Effective media inputs (for computing display URLs/dimensions) */
interface SharedLightboxMediaProps {
  effectiveImageUrl: string;
  imageDimensions: { width: number; height: number };
  projectAspectRatio?: string;
}

export interface UseSharedLightboxStateInput {
  core: SharedLightboxCoreProps;
  navigation: SharedLightboxNavigationProps;
  shots: SharedLightboxShotProps;
  layout: SharedLightboxLayoutProps;
  actions: SharedLightboxButtonGroupProps;
  media: SharedLightboxMediaProps;
  starred?: boolean;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
}

// ============================================================================
// Return Interface
// ============================================================================

export interface UseSharedLightboxStateReturn {
  // Variants
  variants: {
    list: GenerationVariant[];
    primaryVariant: GenerationVariant | null;
    activeVariant: GenerationVariant | null;
    isLoading: boolean;
    setActiveVariantId: (id: string) => void;
    refetch: () => void;
    setPrimaryVariant: (id: string) => Promise<void>;
    deleteVariant: (id: string) => Promise<void>;
    isViewingNonPrimaryVariant: boolean;
    // Promotion
    promoteSuccess: boolean;
    isPromoting: boolean;
    handlePromoteToGeneration: (variantId: string) => Promise<void>;
    handleAddVariantAsNewGenerationToShot: (
      shotId: string,
      variantId: string,
      currentTimelineFrame?: number
    ) => Promise<boolean>;
  };

  // Download ref (for race condition fix)
  intendedActiveVariantIdRef: React.RefObject<string | null>;

  // Navigation
  navigation: {
    safeClose: () => void;
    activateClickShield: () => void;
    swipeNavigation: ReturnType<typeof useSwipeNavigation>;
  };

  // Star
  star: {
    localStarred: boolean;
    setLocalStarred: (v: boolean) => void;
    toggleStarMutation: UseMutationResult<void, Error, { id: string; starred: boolean; shotId?: string }>;
    handleToggleStar: () => void;
  };

  // References & Join
  references: {
    isAddingToReferences: boolean;
    addToReferencesSuccess: boolean;
    handleAddToReferences: () => Promise<void>;
    isAddingToJoin: boolean;
    addToJoinSuccess: boolean;
    handleAddToJoin: () => void;
    handleGoToJoin: () => void;
  };

  // Lineage
  lineage: {
    derivedItems: DerivedItem[];
    derivedGenerations: GenerationRow[];
    derivedPage: number;
    derivedTotalPages: number;
    paginatedDerived: DerivedItem[];
    setDerivedPage: (page: number) => void;
  };

  // Shot management
  shots: {
    // Positioning
    isAlreadyPositionedInSelectedShot: boolean;
    isAlreadyAssociatedWithoutPosition: boolean;
    handleAddToShot: () => Promise<void>;
    handleAddToShotWithoutPosition: () => Promise<void>;
    // Creation
    isCreatingShot: boolean;
    quickCreateSuccess: QuickCreateSuccess;
    handleQuickCreateAndAdd: () => Promise<void>;
    handleQuickCreateSuccess: () => void;
  };

  // Source generation (for child generations)
  sourceGeneration: {
    data: GenerationRow | null;
    primaryVariant: SourceVariantData | null;
  };

  // Make main variant
  makeMainVariant: {
    canMake: boolean;
    canMakeFromChild: boolean;
    canMakeFromVariant: boolean;
    isMaking: boolean;
    handle: () => Promise<void>;
  };

  // Effective media (computed URLs/dimensions)
  effectiveMedia: {
    videoUrl: string | undefined;
    mediaUrl: string | undefined;
    imageDimensions: { width: number; height: number };
  };

  // Layout mode
  layout: {
    isTabletOrLarger: boolean;
    isTouchLikeDevice: boolean;
    shouldShowSidePanel: boolean;
    isUnifiedEditMode: boolean;
    isPortraitMode: boolean;
  };

  // Button group props (pre-built)
  buttonGroupProps: LightboxButtonGroupProps;
}

// ============================================================================
// Hook Implementation
// ============================================================================

interface SharedVariantsStateResult {
  section: UseSharedLightboxStateReturn['variants'];
  intendedActiveVariantIdRef: React.RefObject<string | null>;
  activeVariant: GenerationVariant | null;
  primaryVariant: GenerationVariant | null;
  isViewingNonPrimaryVariant: boolean;
  setPrimaryVariant: (id: string) => Promise<void>;
  refetchVariants: () => void;
}

export interface LightboxButtonGroupProps {
  topRight: {
    showDownload: boolean;
    handleDownload?: () => Promise<void>;
    isDownloading: boolean;
    onDelete?: (id: string) => void;
    handleDelete?: () => void;
    isDeleting?: string | null;
    onClose: () => void;
  };
  bottomLeft: {
    isUpscaling: boolean;
    handleUpscale: () => Promise<void>;
    localStarred: boolean;
    handleToggleStar: () => void;
    toggleStarPending: boolean;
  };
  bottomRight: {
    isAddingToReferences: boolean;
    addToReferencesSuccess: boolean;
    handleAddToReferences: () => Promise<void>;
    handleAddToJoin?: () => void;
    isAddingToJoin?: boolean;
    addToJoinSuccess?: boolean;
    onGoToJoin?: () => void;
  };
}

/**
 * Variants sub-facade: variant loading, selection, promotion.
 * Usable standalone when callers only need variant state.
 */
export function useSharedVariantsState(input: UseSharedLightboxStateInput): SharedVariantsStateResult {
  const {
    media,
    isFormOnlyMode,
    variantFetchGenerationId,
    initialVariantId,
    selectedProjectId,
  } = input.core;
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

/**
 * Navigation sub-facade: keyboard nav, swipe nav, safe close.
 * Usable standalone when callers only need navigation controls.
 */
export function useLightboxNavigationModel(input: UseSharedLightboxStateInput): UseSharedLightboxStateReturn['navigation'] {
  const { onClose, readOnly } = input.core;
  const {
    hasNext = false,
    hasPrevious = false,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeDisabled,
    showNavigation,
  } = input.navigation;
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
export const useSharedNavigationState = useLightboxNavigationModel;

/**
 * Shot management sub-facade: positioning, creation, association state.
 * Usable standalone when callers only need shot management.
 */
export function useLightboxShotActions(input: UseSharedLightboxStateInput): UseSharedLightboxStateReturn['shots'] {
  const { media, selectedProjectId, onClose } = input.core;
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
  } = input.shots;
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
export const useSharedShotState = useLightboxShotActions;

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

function useSharedButtonGroupState(params: {
  input: UseSharedLightboxStateInput;
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
    input,
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
  const { media, onClose } = input.core;
  const {
    showDownload,
    isDownloading,
    onDelete,
    isDeleting,
    isUpscaling,
    handleUpscale,
  } = input.actions;
  const handleDelete = useCallback(() => {
    if (onDelete) onDelete(media.id);
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

export function useSharedLightboxState(input: UseSharedLightboxStateInput): UseSharedLightboxStateReturn {
  const variantsState = useSharedVariantsState(input);
  const interactionState = useSharedLightboxInteractionState(input, variantsState);
  const presentationState = useLightboxPanelModel(input, variantsState, interactionState);

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

export interface SharedLightboxInteractionState {
  star: UseSharedLightboxStateReturn['star'];
  references: UseSharedLightboxStateReturn['references'];
  lineage: UseSharedLightboxStateReturn['lineage'];
  shots: UseSharedLightboxStateReturn['shots'];
  sourceGeneration: UseSharedLightboxStateReturn['sourceGeneration'];
  makeMainVariant: UseSharedLightboxStateReturn['makeMainVariant'];
}

export function useSharedLightboxInteractionState(
  input: UseSharedLightboxStateInput,
  variantsState: SharedVariantsStateResult,
): SharedLightboxInteractionState {
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
  const joinState = useJoinClips({ media: input.core.media, isVideo: input.core.isVideo });
  const lineageState = useGenerationLineage({
    media: input.core.media,
    enabled: !input.core.isFormOnlyMode,
  });
  const shots = useLightboxShotActions(input);
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

export interface SharedLightboxPresentationState {
  variants: UseSharedLightboxStateReturn['variants'];
  intendedActiveVariantIdRef: UseSharedLightboxStateReturn['intendedActiveVariantIdRef'];
  navigation: UseSharedLightboxStateReturn['navigation'];
  effectiveMedia: UseSharedLightboxStateReturn['effectiveMedia'];
  layout: UseSharedLightboxStateReturn['layout'];
  buttonGroupProps: UseSharedLightboxStateReturn['buttonGroupProps'];
}

export function useLightboxPanelModel(
  input: UseSharedLightboxStateInput,
  variantsState: SharedVariantsStateResult,
  interactionState: SharedLightboxInteractionState,
): SharedLightboxPresentationState {
  const navigation = useLightboxNavigationModel(input);
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
    input,
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
export const useSharedLightboxPresentationState = useLightboxPanelModel;
