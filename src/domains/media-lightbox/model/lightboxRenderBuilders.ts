import type { GenerationRow } from '@/domains/generation/types';
import type { LightboxLayoutProps } from '../components/layouts/types';
import type { WorkflowControlsBarProps } from '../components/WorkflowControlsBar';
import type { LightboxStateValue } from '../contexts/LightboxStateContext';
import type { AdjacentSegmentsData, SegmentSlotModeData } from '../types';

interface BuildLightboxVariantStateInput {
  sharedVariants: {
    list: LightboxStateValue['variants']['variants'];
    activeVariant: LightboxStateValue['variants']['activeVariant'];
    primaryVariant: LightboxStateValue['variants']['primaryVariant'];
    isLoading: boolean;
    setActiveVariantId: (id: string) => void;
    setPrimaryVariant: (id: string) => Promise<void>;
    deleteVariant: (id: string) => Promise<void>;
    promoteSuccess: boolean;
    isPromoting: boolean;
    handlePromoteToGeneration: (variantId: string) => Promise<void>;
  };
  makeMainVariant: {
    isMaking: boolean;
    canMake: boolean;
    handle: () => Promise<void>;
  };
  onLoadVariantSettings?: LightboxStateValue['variants']['onLoadVariantSettings'];
  onLoadVariantImages?: LightboxStateValue['variants']['onLoadVariantImages'];
  currentSegmentImages?: LightboxStateValue['variants']['currentSegmentImages'];
  pendingTaskCount: number;
  unviewedVariantCount: number;
  onMarkAllViewed: () => void;
  variantsSectionRef: LightboxStateValue['variants']['variantsSectionRef'];
}

export function buildLightboxVariantState(
  input: BuildLightboxVariantStateInput,
): LightboxStateValue['variants'] {
  return {
    variants: input.sharedVariants.list,
    activeVariant: input.sharedVariants.activeVariant,
    primaryVariant: input.sharedVariants.primaryVariant,
    isLoadingVariants: input.sharedVariants.isLoading,
    handleVariantSelect: input.sharedVariants.setActiveVariantId,
    handleMakePrimary: input.sharedVariants.setPrimaryVariant,
    handleDeleteVariant: input.sharedVariants.deleteVariant,
    onLoadVariantSettings: input.onLoadVariantSettings,
    onLoadVariantImages: input.onLoadVariantImages,
    currentSegmentImages: input.currentSegmentImages,
    promoteSuccess: input.sharedVariants.promoteSuccess,
    isPromoting: input.sharedVariants.isPromoting,
    handlePromoteToGeneration: input.sharedVariants.handlePromoteToGeneration,
    isMakingMainVariant: input.makeMainVariant.isMaking,
    canMakeMainVariant: input.makeMainVariant.canMake,
    handleMakeMainVariant: input.makeMainVariant.handle,
    pendingTaskCount: input.pendingTaskCount,
    unviewedVariantCount: input.unviewedVariantCount,
    onMarkAllViewed: input.onMarkAllViewed,
    variantsSectionRef: input.variantsSectionRef,
  };
}

interface BuildLightboxStateValueInput {
  onClose: () => void;
  readOnly: boolean;
  isMobile: boolean;
  isTabletOrLarger: boolean;
  selectedProjectId: string | null;
  actualGenerationId: string | null;
  media: GenerationRow;
  isVideo: boolean;
  effectiveMediaUrl: string;
  effectiveVideoUrl: string;
  effectiveImageDimensions: LightboxStateValue['media']['effectiveImageDimensions'];
  imageDimensions: LightboxStateValue['media']['imageDimensions'];
  setImageDimensions: LightboxStateValue['media']['setImageDimensions'];
  variants: LightboxStateValue['variants'];
  showNavigation: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
  swipeNavigation: LightboxStateValue['navigation']['swipeNavigation'];
}

export function buildLightboxStateValue(input: BuildLightboxStateValueInput): LightboxStateValue {
  return {
    core: {
      onClose: input.onClose,
      readOnly: input.readOnly,
      isMobile: input.isMobile,
      isTabletOrLarger: input.isTabletOrLarger,
      selectedProjectId: input.selectedProjectId,
      actualGenerationId: input.actualGenerationId,
    },
    media: {
      media: input.media,
      isVideo: input.isVideo,
      effectiveMediaUrl: input.effectiveMediaUrl,
      effectiveVideoUrl: input.effectiveVideoUrl,
      effectiveImageDimensions: input.effectiveImageDimensions,
      imageDimensions: input.imageDimensions,
      setImageDimensions: input.setImageDimensions,
    },
    variants: input.variants,
    navigation: {
      showNavigation: input.showNavigation,
      hasNext: input.hasNext,
      hasPrevious: input.hasPrevious,
      handleSlotNavNext: input.handleSlotNavNext,
      handleSlotNavPrev: input.handleSlotNavPrev,
      swipeNavigation: input.swipeNavigation,
    },
  };
}

interface BuildLightboxLayoutPropsInput {
  showPanel: boolean;
  shouldShowSidePanel: boolean;
  effectiveTasksPaneOpen: boolean;
  effectiveTasksPaneWidth: number;
  workflowBar: WorkflowControlsBarProps;
  buttonGroups: LightboxLayoutProps['buttonGroups'];
  handleDownload: () => Promise<void>;
  handleDelete: () => Promise<void>;
  adjacentSegments?: AdjacentSegmentsData;
  segmentSlotMode?: SegmentSlotModeData;
}

export function buildLightboxLayoutProps(
  input: BuildLightboxLayoutPropsInput,
): LightboxLayoutProps {
  return {
    showPanel: input.showPanel,
    shouldShowSidePanel: input.shouldShowSidePanel,
    effectiveTasksPaneOpen: input.effectiveTasksPaneOpen,
    effectiveTasksPaneWidth: input.effectiveTasksPaneWidth,
    workflowBar: input.workflowBar,
    buttonGroups: {
      ...input.buttonGroups,
      topRight: {
        ...input.buttonGroups.topRight,
        handleDownload: input.handleDownload,
        handleDelete: input.handleDelete,
      },
    },
    adjacentSegments: input.adjacentSegments,
    segmentSlotMode: input.segmentSlotMode,
  };
}
