import type { RefObject } from 'react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { GenerationRow } from '@/domains/generation/types';
import type { DerivedItem } from '@/domains/generation/hooks/useDerivedItems';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import type { QuickCreateSuccess, LightboxDeleteHandler, LightboxShotWorkflowProps } from '../types';
import type { SourceVariantData } from './useSourceGeneration';
import type { useSwipeNavigation as UseSwipeNavigationType } from './useSwipeNavigation';

/** Core media and project context */
export interface SharedLightboxCoreProps {
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
export interface SharedLightboxNavigationProps {
  showNavigation?: boolean;
  hasNext?: boolean;
  hasPrevious?: boolean;
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
  swipeDisabled: boolean;
}

/** Shot management callbacks and optimistic state */
export interface SharedLightboxShotProps {
  shotId?: string;
  shotWorkflow?: LightboxShotWorkflowProps;
}

/** Layout mode inputs (drives panel/edit mode visibility) */
export interface SharedLightboxLayoutProps {
  showTaskDetails?: boolean;
  isSpecialEditMode: boolean;
  isInpaintMode: boolean;
  isMagicEditMode: boolean;
}

/** Button group inputs (download, delete, star, upscale, edit mode) */
export interface SharedLightboxButtonGroupProps {
  isCloudMode: boolean;
  showDownload?: boolean;
  isDownloading: boolean;
  setIsDownloading: (v: boolean) => void;
  onDelete?: LightboxDeleteHandler;
  isDeleting?: string | null;
  isUpscaling: boolean;
  handleUpscale: () => void;
}

/** Effective media inputs (for computing display URLs/dimensions) */
export interface SharedLightboxMediaProps {
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

export interface LightboxButtonGroupProps {
  topRight: {
    showDownload: boolean;
    handleDownload?: () => Promise<void>;
    isDownloading: boolean;
    onDelete?: LightboxDeleteHandler;
    handleDelete?: () => Promise<void>;
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

export interface UseSharedLightboxStateReturn {
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
    promoteSuccess: boolean;
    isPromoting: boolean;
    handlePromoteToGeneration: (variantId: string) => Promise<void>;
    handleAddVariantAsNewGenerationToShot: (
      shotId: string,
      variantId: string,
      currentTimelineFrame?: number,
    ) => Promise<boolean>;
  };
  intendedActiveVariantIdRef: RefObject<string | null>;
  navigation: {
    safeClose: () => void;
    activateClickShield: () => void;
    swipeNavigation: ReturnType<typeof UseSwipeNavigationType>;
  };
  star: {
    localStarred: boolean;
    setLocalStarred: (v: boolean) => void;
    toggleStarMutation: UseMutationResult<void, Error, { id: string; starred: boolean; shotId?: string }>;
    handleToggleStar: () => void;
  };
  references: {
    isAddingToReferences: boolean;
    addToReferencesSuccess: boolean;
    handleAddToReferences: () => Promise<void>;
    isAddingToJoin: boolean;
    addToJoinSuccess: boolean;
    handleAddToJoin: () => void;
    handleGoToJoin: () => void;
  };
  lineage: {
    derivedItems: DerivedItem[];
    derivedGenerations: GenerationRow[];
    derivedPage: number;
    derivedTotalPages: number;
    paginatedDerived: DerivedItem[];
    setDerivedPage: (page: number) => void;
  };
  shots: {
    isAlreadyPositionedInSelectedShot: boolean;
    isAlreadyAssociatedWithoutPosition: boolean;
    handleAddToShot: () => Promise<void>;
    handleAddToShotWithoutPosition: () => Promise<void>;
    isCreatingShot: boolean;
    quickCreateSuccess: QuickCreateSuccess;
    handleQuickCreateAndAdd: () => Promise<void>;
    handleQuickCreateSuccess: () => void;
  };
  sourceGeneration: {
    data: GenerationRow | null;
    primaryVariant: SourceVariantData | null;
  };
  makeMainVariant: {
    canMake: boolean;
    canMakeFromChild: boolean;
    canMakeFromVariant: boolean;
    isMaking: boolean;
    handle: () => Promise<void>;
  };
  effectiveMedia: {
    videoUrl: string | undefined;
    mediaUrl: string | undefined;
    imageDimensions: { width: number; height: number };
  };
  layout: {
    isTabletOrLarger: boolean;
    isTouchLikeDevice: boolean;
    shouldShowSidePanel: boolean;
    isUnifiedEditMode: boolean;
    isPortraitMode: boolean;
  };
  buttonGroupProps: LightboxButtonGroupProps;
}

export interface VariantsStateResult {
  section: UseSharedLightboxStateReturn['variants'];
  intendedActiveVariantIdRef: RefObject<string | null>;
  activeVariant: GenerationVariant | null;
  primaryVariant: GenerationVariant | null;
  isViewingNonPrimaryVariant: boolean;
  setPrimaryVariant: (id: string) => Promise<void>;
  refetchVariants: () => void;
}

export interface InteractionState {
  star: UseSharedLightboxStateReturn['star'];
  references: UseSharedLightboxStateReturn['references'];
  lineage: UseSharedLightboxStateReturn['lineage'];
  shots: UseSharedLightboxStateReturn['shots'];
  sourceGeneration: UseSharedLightboxStateReturn['sourceGeneration'];
  makeMainVariant: UseSharedLightboxStateReturn['makeMainVariant'];
}
