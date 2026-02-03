export { useUpscale } from './useUpscale';
export type { UseUpscaleProps, UseUpscaleReturn } from './useUpscale';

export { useInpainting } from './useInpainting';
export type { BrushStroke, EditMode as InpaintEditMode, AnnotationMode, UseInpaintingProps, UseInpaintingReturn } from './useInpainting';

export { useReferences } from './useReferences';
export type { UseReferencesProps, UseReferencesReturn } from './useReferences';

export { useGenerationLineage } from './useGenerationLineage';
export type { UseGenerationLineageProps, UseGenerationLineageReturn } from './useGenerationLineage';

export { useShotCreation } from './useShotCreation';
export type { UseShotCreationProps, UseShotCreationReturn } from './useShotCreation';

export { useLightboxNavigation } from './useLightboxNavigation';
export type { UseLightboxNavigationProps, UseLightboxNavigationReturn } from './useLightboxNavigation';

export { useStarToggle } from './useStarToggle';
export type { UseStarToggleProps, UseStarToggleReturn } from './useStarToggle';

export { useShotPositioning } from './useShotPositioning';
export type { UseShotPositioningProps, UseShotPositioningReturn } from './useShotPositioning';

export { useEditModeLoRAs } from './useEditModeLoRAs';
export type { LoraMode } from './useEditModeLoRAs';
export { useSourceGeneration } from './useSourceGeneration';
export { useLayoutMode } from './useLayoutMode';
export { useMagicEditMode } from './useMagicEditMode';

// Edit settings persistence hooks - internal use only, not re-exported
// useGenerationEditSettings and useLastUsedEditSettings are used internally
// by useEditSettingsPersistence. Types are re-exported for consumers.
export type {
  GenerationEditSettings,
  EditMode,
  QwenEditModel,
} from './useGenerationEditSettings';

export type {
  LastUsedEditSettings,
  VideoEditSubMode,
  PanelMode,
} from './useLastUsedEditSettings';

export { useEditSettingsPersistence } from './useEditSettingsPersistence';
export type { 
  UseEditSettingsPersistenceProps, 
  UseEditSettingsPersistenceReturn,
} from './useEditSettingsPersistence';

// useVideoEditing is internal-only, used by useLightboxVideoMode
export type {
  UseVideoEditingReturn,
} from './useVideoEditing';

export { useRepositionMode } from './useRepositionMode';
export type { 
  UseRepositionModeProps, 
  UseRepositionModeReturn,
  ImageTransform,
} from './useRepositionMode';

export { useSwipeNavigation } from './useSwipeNavigation';
export type {
  UseSwipeNavigationProps,
  UseSwipeNavigationReturn,
} from './useSwipeNavigation';

export { useButtonGroupProps } from './useButtonGroupProps';

export { useImg2ImgMode } from './useImg2ImgMode';
export type {
  UseImg2ImgModeProps,
  UseImg2ImgModeReturn,
} from './useImg2ImgMode';

// useVideoEditModeHandlers is internal-only, used by useLightboxVideoMode
// useSegmentSlotMode is dead code - VideoLightbox uses props directly

// Media and task details hooks
export { useEffectiveMedia } from './useEffectiveMedia';
export type {
  UseEffectiveMediaProps,
  UseEffectiveMediaReturn,
} from './useEffectiveMedia';

export { useAdjustedTaskDetails } from './useAdjustedTaskDetails';
export type {
  UseAdjustedTaskDetailsProps,
  UseAdjustedTaskDetailsReturn,
} from './useAdjustedTaskDetails';

// Video regenerate mode hook
export { useVideoRegenerateMode } from './useVideoRegenerateMode';
export type {
  UseVideoRegenerateModeProps,
  UseVideoRegenerateModeReturn,
  CurrentSegmentImages,
} from './useVideoRegenerateMode';

// Replace in shot hook
export { useReplaceInShot } from './useReplaceInShot';
export type {
  UseReplaceInShotProps,
  UseReplaceInShotReturn,
} from './useReplaceInShot';

// Make main variant hook
export { useMakeMainVariant } from './useMakeMainVariant';
export type {
  UseMakeMainVariantProps,
  UseMakeMainVariantReturn,
} from './useMakeMainVariant';

// Panel mode restoration hook
export { usePanelModeRestore } from './usePanelModeRestore';
export type {
  UsePanelModeRestoreProps,
  UsePanelModeRestoreReturn,
} from './usePanelModeRestore';

// Edit settings sync hook
export { useEditSettingsSync } from './useEditSettingsSync';
export type {
  UseEditSettingsSyncProps,
  UseEditSettingsSyncReturn,
} from './useEditSettingsSync';

// Join clips hook
export { useJoinClips } from './useJoinClips';
export type {
  UseJoinClipsProps,
  UseJoinClipsReturn,
} from './useJoinClips';

// Variant selection hook
export { useVariantSelection } from './useVariantSelection';
export type {
  UseVariantSelectionProps,
  UseVariantSelectionReturn,
} from './useVariantSelection';

// Variant promotion hook
export { useVariantPromotion } from './useVariantPromotion';
export type {
  UseVariantPromotionProps,
  UseVariantPromotionReturn,
} from './useVariantPromotion';

// Layout props hook
export { useLightboxLayoutProps } from './useLightboxLayoutProps';
export type {
  UseLightboxLayoutPropsInput,
  UseLightboxLayoutPropsReturn,
} from './useLightboxLayoutProps';

// Lightbox state context value hook
export { useLightboxStateValue } from './useLightboxStateValue';
export type {
  UseLightboxStateValueInput,
} from './useLightboxStateValue';

// Lightbox video mode hook (consolidates video-related hooks)
export { useLightboxVideoMode } from './useLightboxVideoMode';
export type {
  UseLightboxVideoModeProps,
  UseLightboxVideoModeReturn,
} from './useLightboxVideoMode';

// Shared lightbox state hook (consolidates hooks shared between image/video)
export { useSharedLightboxState } from './useSharedLightboxState';
export type {
  UseSharedLightboxStateProps,
  UseSharedLightboxStateReturn,
} from './useSharedLightboxState';

