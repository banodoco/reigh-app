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
} from '@/shared/components/MediaLightbox/hooks';

export type {
  EditMode as SettingsEditMode,
} from '@/shared/components/MediaLightbox/hooks/editSettingsTypes';

export type {
  EditMode as InpaintingEditMode,
} from '@/shared/components/MediaLightbox/hooks/inpainting/types';

export {
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
