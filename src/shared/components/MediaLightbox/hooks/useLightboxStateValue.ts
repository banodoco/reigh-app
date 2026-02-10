/**
 * useLightboxStateValue
 *
 * Builds the LightboxStateContext value from MediaLightbox's state.
 * This centralizes the context value construction, making it easy to
 * see what state is exposed to child components via context.
 */

import { useMemo, RefObject } from 'react';
import type { GenerationRow } from '@/types/shots';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import type { LightboxStateValue } from '../contexts/LightboxStateContext';
import type { CurrentSegmentImagesData } from '@/shared/components/VariantSelector/utils';

interface UseLightboxStateValueInput {
  // Core
  onClose: () => void;
  readOnly: boolean;
  isMobile: boolean;
  isTabletOrLarger: boolean;
  selectedProjectId: string | null;
  actualGenerationId: string | null;

  // Media
  media: GenerationRow;
  isVideo: boolean;
  effectiveMediaUrl: string;
  effectiveVideoUrl: string;
  effectiveImageDimensions: { width: number; height: number } | null;
  imageDimensions: { width: number; height: number } | null;
  setImageDimensions: (dims: { width: number; height: number }) => void;

  // Variants
  variants: GenerationVariant[];
  activeVariant: GenerationVariant | null;
  primaryVariant: GenerationVariant | null;
  isLoadingVariants: boolean;
  setActiveVariantId: (id: string) => void;
  setPrimaryVariant: (id: string) => void;
  deleteVariant: (id: string) => void;
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;
  onLoadVariantImages?: (variant: GenerationVariant) => void;
  currentSegmentImages?: CurrentSegmentImagesData;
  promoteSuccess: boolean;
  isPromoting: boolean;
  handlePromoteToGeneration: (variantId: string) => Promise<void>;
  isMakingMainVariant: boolean;
  canMakeMainVariant: boolean;
  handleMakeMainVariant: () => Promise<void>;
  pendingTaskCount: number;
  unviewedVariantCount: number;
  onMarkAllViewed: () => void;
  variantsSectionRef: RefObject<HTMLDivElement> | null;

  // Navigation
  showNavigation: boolean;
  hasNext: boolean;
  hasPrevious: boolean;
  handleSlotNavNext: () => void;
  handleSlotNavPrev: () => void;
  swipeNavigation: {
    swipeHandlers: Record<string, unknown>;
    isSwiping: boolean;
    swipeOffset: number;
  };

  // Edit
  isInpaintMode: boolean;
  isSpecialEditMode: boolean;
  isInVideoEditMode: boolean;
  editMode: string;
  setEditMode: (mode: string) => void;
  setIsInpaintMode: (value: boolean) => void;
}

/**
 * Builds a memoized LightboxStateValue from component state.
 * The returned value is suitable for passing to LightboxStateProvider.
 */
export function useLightboxStateValue(
  input: UseLightboxStateValueInput
): LightboxStateValue {
  // Build core state (stable reference)
  const core = useMemo(() => ({
    onClose: input.onClose,
    readOnly: input.readOnly,
    isMobile: input.isMobile,
    isTabletOrLarger: input.isTabletOrLarger,
    selectedProjectId: input.selectedProjectId,
    actualGenerationId: input.actualGenerationId,
  }), [
    input.onClose,
    input.readOnly,
    input.isMobile,
    input.isTabletOrLarger,
    input.selectedProjectId,
    input.actualGenerationId,
  ]);

  // Build media state
  const media = useMemo(() => ({
    media: input.media,
    isVideo: input.isVideo,
    effectiveMediaUrl: input.effectiveMediaUrl,
    effectiveVideoUrl: input.effectiveVideoUrl,
    effectiveImageDimensions: input.effectiveImageDimensions,
    imageDimensions: input.imageDimensions,
    setImageDimensions: input.setImageDimensions,
  }), [
    input.media,
    input.isVideo,
    input.effectiveMediaUrl,
    input.effectiveVideoUrl,
    input.effectiveImageDimensions,
    input.imageDimensions,
    input.setImageDimensions,
  ]);

  // Build variants state
  // Maps internal hook names (set*) to UI component names (handle*)
  const variants = useMemo(() => ({
    variants: input.variants,
    activeVariant: input.activeVariant,
    primaryVariant: input.primaryVariant,
    isLoadingVariants: input.isLoadingVariants,
    // Transform set* inputs to handle* outputs for UI components
    handleVariantSelect: input.setActiveVariantId,
    handleMakePrimary: async (id: string) => input.setPrimaryVariant(id),
    handleDeleteVariant: async (id: string) => input.deleteVariant(id),
    onLoadVariantSettings: input.onLoadVariantSettings,
    onLoadVariantImages: input.onLoadVariantImages,
    currentSegmentImages: input.currentSegmentImages,
    promoteSuccess: input.promoteSuccess,
    isPromoting: input.isPromoting,
    handlePromoteToGeneration: input.handlePromoteToGeneration,
    isMakingMainVariant: input.isMakingMainVariant,
    canMakeMainVariant: input.canMakeMainVariant,
    handleMakeMainVariant: input.handleMakeMainVariant,
    pendingTaskCount: input.pendingTaskCount,
    unviewedVariantCount: input.unviewedVariantCount,
    onMarkAllViewed: input.onMarkAllViewed,
    variantsSectionRef: input.variantsSectionRef,
  }), [
    input.variants,
    input.activeVariant,
    input.primaryVariant,
    input.isLoadingVariants,
    input.setActiveVariantId,
    input.setPrimaryVariant,
    input.deleteVariant,
    input.onLoadVariantSettings,
    input.onLoadVariantImages,
    input.currentSegmentImages,
    input.promoteSuccess,
    input.isPromoting,
    input.handlePromoteToGeneration,
    input.isMakingMainVariant,
    input.canMakeMainVariant,
    input.handleMakeMainVariant,
    input.pendingTaskCount,
    input.unviewedVariantCount,
    input.onMarkAllViewed,
    input.variantsSectionRef,
  ]);

  // Build navigation state
  const navigation = useMemo(() => ({
    showNavigation: input.showNavigation,
    hasNext: input.hasNext,
    hasPrevious: input.hasPrevious,
    handleSlotNavNext: input.handleSlotNavNext,
    handleSlotNavPrev: input.handleSlotNavPrev,
    swipeNavigation: input.swipeNavigation,
  }), [
    input.showNavigation,
    input.hasNext,
    input.hasPrevious,
    input.handleSlotNavNext,
    input.handleSlotNavPrev,
    input.swipeNavigation,
  ]);

  // Build edit state
  const edit = useMemo(() => ({
    isInpaintMode: input.isInpaintMode,
    isSpecialEditMode: input.isSpecialEditMode,
    isInVideoEditMode: input.isInVideoEditMode,
    editMode: input.editMode,
    setEditMode: input.setEditMode,
    setIsInpaintMode: input.setIsInpaintMode,
  }), [
    input.isInpaintMode,
    input.isSpecialEditMode,
    input.isInVideoEditMode,
    input.editMode,
    input.setEditMode,
    input.setIsInpaintMode,
  ]);

  // Combine into final value
  return useMemo(() => ({
    core,
    media,
    variants,
    navigation,
    edit,
  }), [core, media, variants, navigation, edit]);
}
