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
 * - Button group props: useButtonGroupProps
 *
 * NOT included (media-type specific):
 * - Image: useInpainting, useUpscale, useMagicEditMode, useRepositionMode, useImg2ImgMode
 * - Video: useLightboxVideoMode, useVideoRegenerateMode
 */

import { useRef, useEffect, useMemo, useCallback } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { GenerationRow, Shot } from '@/types/shots';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import type { DerivedItem } from '@/shared/hooks/useDerivedItems';
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
import { useButtonGroupProps } from './useButtonGroupProps';

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
  isPendingUpscale: boolean;
  hasUpscaledVersion: boolean;
  showingUpscaled: boolean;
  handleUpscale: () => void;
  handleToggleUpscaled: () => void;
  handleEnterMagicEditMode: () => void;
}

/** Effective media inputs (for computing display URLs/dimensions) */
interface SharedLightboxMediaProps {
  effectiveImageUrl: string;
  imageDimensions: { width: number; height: number };
  projectAspectRatio?: string;
}

// ============================================================================
// Composed Props Interface
// ============================================================================

interface UseSharedLightboxStateProps
  extends SharedLightboxCoreProps,
    SharedLightboxNavigationProps,
    SharedLightboxShotProps,
    SharedLightboxLayoutProps,
    SharedLightboxButtonGroupProps,
    SharedLightboxMediaProps {
  /** Star state (separate simple field) */
  starred?: boolean;
  /** External generation navigation */
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
}

// ============================================================================
// Return Interface
// ============================================================================

interface UseSharedLightboxStateReturn {
  // Variants
  variants: {
    list: GenerationVariant[];
    primaryVariant: GenerationVariant | null;
    activeVariant: GenerationVariant | null;
    isLoading: boolean;
    setActiveVariantId: (id: string) => void;
    refetch: () => void;
    setPrimaryVariant: (id: string) => void;
    deleteVariant: (id: string) => void;
    isViewingNonPrimaryVariant: boolean;
    // Promotion
    promoteSuccess: boolean;
    isPromoting: boolean;
    handlePromoteToGeneration: () => void;
    handleAddVariantAsNewGenerationToShot: (shotId: string) => void;
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
    handleAddToReferences: () => void;
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
    handleAddToShot: (shotId: string) => Promise<void>;
    handleAddToShotWithoutPosition: (shotId: string) => Promise<void>;
    // Creation
    isCreatingShot: boolean;
    quickCreateSuccess: QuickCreateSuccess;
    handleQuickCreateAndAdd: (name: string, files: File[]) => Promise<void>;
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
    handle: () => void;
  };

  // Effective media (computed URLs/dimensions)
  effectiveMedia: {
    videoUrl: string;
    mediaUrl: string;
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
  buttonGroupProps: ReturnType<typeof useButtonGroupProps>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useSharedLightboxState(props: UseSharedLightboxStateProps): UseSharedLightboxStateReturn {
  const {
    // Core
    media,
    isVideo,
    selectedProjectId,
    isMobile,
    isFormOnlyMode,
    onClose,
    readOnly,
    variantFetchGenerationId,
    initialVariantId,
    starred,
    onOpenExternalGeneration,
    // Navigation
    showNavigation,
    hasNext = false,
    hasPrevious = false,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeDisabled,
    // Shot management
    shotId,
    selectedShotId,
    allShots,
    onShotChange,
    onAddToShot,
    onAddToShotWithoutPosition,
    onNavigateToShot,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    // Layout
    showTaskDetails,
    isSpecialEditMode,
    isInpaintMode,
    isMagicEditMode,
    // Button group
    isCloudMode,
    showDownload,
    isDownloading,
    // setIsDownloading intentionally not destructured — unused in this hook
    onDelete,
    isDeleting,
    isUpscaling,
    isPendingUpscale,
    hasUpscaledVersion,
    showingUpscaled,
    handleUpscale,
    handleToggleUpscaled,
    handleEnterMagicEditMode,
    // Effective media
    effectiveImageUrl,
    imageDimensions,
    projectAspectRatio,
  } = props;

  // ========================================
  // VARIANTS
  // ========================================

  const variantsHook = useVariants({
    generationId: variantFetchGenerationId,
    enabled: !isFormOnlyMode,
  });
  const {
    variants,
    primaryVariant,
    activeVariant,
    isLoading: isLoadingVariants,
    setActiveVariantId: rawSetActiveVariantId,
    refetch: refetchVariants,
    setPrimaryVariant,
    deleteVariant,
  } = variantsHook;

  // Variant selection with mark-as-viewed
  const { setActiveVariantId: baseSetActiveVariantId, isViewingNonPrimaryVariant } = useVariantSelection({
    media,
    rawSetActiveVariantId,
    activeVariant,
    variants,
    initialVariantId,
  });

  // Ref to track intended active variant ID synchronously (for download race condition fix)
  const intendedActiveVariantIdRef = useRef<string | null>(activeVariant?.id || null);

  // Keep ref in sync when activeVariant changes
  useEffect(() => {
    if (activeVariant?.id && activeVariant.id !== intendedActiveVariantIdRef.current) {
      intendedActiveVariantIdRef.current = activeVariant.id;
    }
  }, [activeVariant?.id]);

  // Wrap setActiveVariantId to update ref synchronously
  const setActiveVariantId = useCallback((variantId: string) => {
    intendedActiveVariantIdRef.current = variantId;
    baseSetActiveVariantId(variantId);
  }, [baseSetActiveVariantId]);

  // Variant promotion
  // Note: media.id may be undefined in form-only mode, but promotion actions
  // won't be triggered since there's no media to promote. Use empty string as fallback.
  const {
    promoteSuccess,
    isPromoting,
    handlePromoteToGeneration,
    handleAddVariantAsNewGenerationToShot,
  } = useVariantPromotion({
    selectedProjectId,
  });

  // ========================================
  // NAVIGATION
  // ========================================

  const navigationHook = useLightboxNavigation({
    onNext: handleSlotNavNext,
    onPrevious: handleSlotNavPrev,
    onClose,
  });
  const { safeClose, activateClickShield } = navigationHook;

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

  // ========================================
  // STAR TOGGLE
  // ========================================

  const starToggleHook = useStarToggle({ media, starred, shotId });
  const { localStarred, setLocalStarred, toggleStarMutation, handleToggleStar } = starToggleHook;

  // ========================================
  // REFERENCES & JOIN CLIPS
  // ========================================

  const referencesHook = useReferences({ media, selectedProjectId, isVideo, selectedShotId });
  const {
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
  } = referencesHook;

  const {
    isAddingToJoin,
    addToJoinSuccess,
    handleAddToJoin,
    handleGoToJoin,
  } = useJoinClips({ media, isVideo });

  // ========================================
  // LINEAGE
  // ========================================

  const lineageHook = useGenerationLineage({ media, enabled: !isFormOnlyMode });
  const {
    derivedItems,
    derivedGenerations,
    derivedPage,
    derivedTotalPages,
    paginatedDerived,
    setDerivedPage,
  } = lineageHook;

  // ========================================
  // SHOT MANAGEMENT
  // ========================================

  // Shot creation
  const shotCreationHook = useShotCreation({
    media,
    selectedProjectId,
    allShots,
    onNavigateToShot,
    onClose,
    onShotChange,
  });
  const {
    isCreatingShot,
    quickCreateSuccess,
    handleQuickCreateAndAdd,
    handleQuickCreateSuccess,
  } = shotCreationHook;

  // Shot positioning
  const computedPositionedInSelectedShot = useMemo(() => {
    if (typeof positionedInSelectedShot === 'boolean') return positionedInSelectedShot;
    return undefined;
  }, [positionedInSelectedShot]);

  const shotPositioningHook = useShotPositioning({
    media,
    selectedShotId,
    allShots,
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
  const {
    isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition,
    handleAddToShot,
    handleAddToShotWithoutPosition,
  } = shotPositioningHook;

  // ========================================
  // SOURCE GENERATION
  // ========================================

  const { sourceGenerationData, sourcePrimaryVariant } = useSourceGeneration({
    media,
    onOpenExternalGeneration,
  });

  // ========================================
  // MAKE MAIN VARIANT
  // ========================================

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

  // ========================================
  // EFFECTIVE MEDIA
  // ========================================

  const { effectiveVideoUrl, effectiveMediaUrl, effectiveImageDimensions } = useEffectiveMedia({
    isVideo,
    activeVariant,
    effectiveImageUrl,
    imageDimensions,
    projectAspectRatio,
  });

  // ========================================
  // LAYOUT MODE
  // ========================================

  const layoutHook = useLayoutMode({
    isMobile,
    showTaskDetails,
    isSpecialEditMode,
    isVideo,
    isInpaintMode,
    isMagicEditMode,
  });
  const {
    isTabletOrLarger,
    isTouchLikeDevice,
    shouldShowSidePanel,
    isUnifiedEditMode,
    isPortraitMode,
  } = layoutHook;

  // ========================================
  // BUTTON GROUP PROPS
  // ========================================

  const handleDelete = useCallback(() => {
    if (onDelete) onDelete(media.id);
  }, [onDelete, media.id]);

  // NOTE: handleDownload is NOT provided here - it requires media-specific logic
  // (variant selection, content type, etc.) that only ImageLightbox/VideoLightbox have.
  // Parent components MUST add handleDownload to buttonGroupProps.topRight.
  const buttonGroupProps = useButtonGroupProps({
    isVideo,
    readOnly,
    isSpecialEditMode,
    selectedProjectId,
    isCloudMode,
    mediaId: media.id,
    handleEnterMagicEditMode,
    showDownload,
    // handleDownload intentionally omitted - parent must provide
    isDownloading,
    onDelete,
    handleDelete,
    isDeleting,
    onClose,
    isUpscaling,
    isPendingUpscale,
    hasUpscaledVersion,
    showingUpscaled,
    handleUpscale,
    handleToggleUpscaled,
    localStarred,
    handleToggleStar,
    toggleStarPending: toggleStarMutation.isPending,
    isAddingToReferences,
    addToReferencesSuccess,
    handleAddToReferences,
    handleAddToJoin,
    isAddingToJoin,
    addToJoinSuccess,
    onGoToJoin: handleGoToJoin,
  });

  // ========================================
  // RETURN
  // ========================================

  return {
    variants: {
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

    navigation: {
      safeClose,
      activateClickShield,
      swipeNavigation,
    },

    star: {
      localStarred,
      setLocalStarred,
      toggleStarMutation,
      handleToggleStar,
    },

    references: {
      isAddingToReferences,
      addToReferencesSuccess,
      handleAddToReferences,
      isAddingToJoin,
      addToJoinSuccess,
      handleAddToJoin,
      handleGoToJoin,
    },

    lineage: {
      derivedItems: derivedItems || [],
      derivedGenerations: derivedGenerations || [],
      derivedPage,
      derivedTotalPages,
      paginatedDerived: paginatedDerived || [],
      setDerivedPage,
    },

    shots: {
      isAlreadyPositionedInSelectedShot,
      isAlreadyAssociatedWithoutPosition,
      handleAddToShot,
      handleAddToShotWithoutPosition,
      isCreatingShot,
      quickCreateSuccess,
      handleQuickCreateAndAdd,
      handleQuickCreateSuccess,
    },

    sourceGeneration: {
      data: sourceGenerationData,
      primaryVariant: sourcePrimaryVariant,
    },

    makeMainVariant: {
      canMake: canMakeMainVariant,
      canMakeFromChild: canMakeMainVariantFromChild,
      canMakeFromVariant: canMakeMainVariantFromVariant,
      isMaking: isMakingMainVariant,
      handle: handleMakeMainVariant,
    },

    effectiveMedia: {
      videoUrl: effectiveVideoUrl,
      mediaUrl: effectiveMediaUrl,
      imageDimensions: effectiveImageDimensions,
    },

    layout: {
      isTabletOrLarger,
      isTouchLikeDevice,
      shouldShowSidePanel,
      isUnifiedEditMode,
      isPortraitMode,
    },

    buttonGroupProps,
  };
}
