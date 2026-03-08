import type { LoraModel } from '@/domains/lora/types/lora';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import type { CurrentSegmentImagesData } from '../variantSourceImages';

export interface VariantCardSharedProps {
  activeVariantId: string | null;
  isMobile: boolean;
  readOnly: boolean;
  availableLoras?: LoraModel[];
  copiedVariantId: string | null;
  loadedSettingsVariantId: string | null;
  onVariantSelect: (variantId: string) => void;
  onMakePrimary?: (variantId: string) => Promise<void>;
  onDeleteVariant?: (variantId: string) => void;
  onLoadVariantSettings?: (variantParams: Record<string, unknown>) => void;
  onToggleStar?: (variantId: string, starred: boolean) => void;
  onMouseEnter: (variant: GenerationVariant) => void;
  onShowMobileInfo: (variantId: string) => void;
  onShowLineageGif: (variantId: string) => void;
  onCopyId: (variantId: string) => void;
  onLoadSettings: (variant: GenerationVariant) => void;
  onLoadImages?: (variant: GenerationVariant) => void;
  currentSegmentImages?: CurrentSegmentImagesData;
  loadedImagesVariantId: string | null;
}
