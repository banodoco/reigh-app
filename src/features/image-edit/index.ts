/**
 * Image-edit feature surface for MediaLightbox-driven UI composition.
 */

export {
  useUpscale,
} from '@/shared/components/MediaLightbox/hooks/useUpscale';

export {
  useInpainting,
} from '@/shared/components/MediaLightbox/hooks/useInpainting';

export {
  useEditModeLoRAs,
} from '@/shared/components/MediaLightbox/hooks/useEditModeLoRAs';

export {
  useSourceGeneration,
} from '@/shared/components/MediaLightbox/hooks/useSourceGeneration';

export {
  useMagicEditMode,
} from '@/shared/components/MediaLightbox/hooks/useMagicEditMode';

export {
  useStarToggle,
} from '@/shared/components/MediaLightbox/hooks/useStarToggle';

export {
  useRepositionMode,
} from '@/shared/components/MediaLightbox/hooks/useRepositionMode';

export {
  useImg2ImgMode,
} from '@/shared/components/MediaLightbox/hooks/useImg2ImgMode';

export {
  useEditSettingsPersistence,
} from '@/shared/components/MediaLightbox/hooks/useEditSettingsPersistence';

export {
  useEditSettingsSync,
} from '@/shared/components/MediaLightbox/hooks/useEditSettingsSync';

export type {
  BrushStroke,
  AnnotationMode,
  EditAdvancedSettings,
  QwenEditModel,
  EditMode as InpaintingEditMode,
} from '@/shared/components/MediaLightbox/hooks/inpainting/types';

export type {
  EditMode as SettingsEditMode,
  LoraMode,
} from '@/shared/components/MediaLightbox/hooks/editSettingsTypes';

export type {
  ImageTransform,
} from '@/shared/components/MediaLightbox/hooks/useRepositionMode';

export type {
  MediaDisplayWithCanvas,
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
  EditModePanel,
  FloatingToolControls,
  AnnotationFloatingControls,
} from '@/shared/components/MediaLightbox/components';

export {
  ImageEditProvider,
  type ImageEditMode,
  type ImageEditState,
} from '@/shared/components/MediaLightbox/contexts/ImageEditContext';

export { downloadMedia } from '@/shared/components/MediaLightbox/utils';
