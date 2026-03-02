/**
 * Image-edit feature surface for MediaLightbox-driven UI composition.
 */

export {
  useUpscale,
  useInpainting,
  useEditModeLoRAs,
  useSourceGeneration,
  useMagicEditMode,
  useStarToggle,
  useRepositionMode,
  useImg2ImgMode,
  useEditSettingsPersistence,
  useEditSettingsSync,
} from '@/shared/imageEditCore/hooks';

export type {
  SettingsEditMode,
  InpaintingEditMode,
  BrushStroke,
  AnnotationMode,
  EditAdvancedSettings,
  QwenEditModel,
  LoraMode,
  ImageTransform,
} from '@/shared/imageEditCore/types';

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
} from '@/shared/imageEditCore/context';

export { downloadMedia } from '@/shared/components/MediaLightbox/utils';
