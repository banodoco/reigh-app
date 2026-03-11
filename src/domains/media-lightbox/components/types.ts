import type { LoraModel } from '@/domains/lora/types/lora';
import type { LoraManagerState } from '@/domains/lora/types/loraManager';
import type { EditAdvancedSettings as EditAdvancedSettingsType } from '../hooks/useGenerationEditSettings';
import type { LightboxCoreState, LightboxVariantState } from '../contexts/LightboxStateContext';
import type { ImageEditState } from '../contexts/ImageEditContext';

interface EditModePanelActions {
  handleUnifiedGenerate: () => void;
  handleGenerateAnnotatedEdit: () => void;
  handleGenerateReposition?: () => void;
  handleSaveAsVariant?: () => void;
  handleGenerateImg2Img?: () => void;
}

interface EditModePanelUpscaleControls {
  isCloudMode?: boolean;
  handleUpscale?: () => Promise<void>;
  isUpscaling?: boolean;
  upscaleSuccess?: boolean;
}

interface EditModePanelLoraControls {
  img2imgLoraManager?: LoraManagerState;
  editLoraManager?: LoraManagerState;
  availableLoras?: LoraModel[];
}

interface EditModePanelAdvancedConfig {
  advancedSettings?: EditAdvancedSettingsType;
  setAdvancedSettings?: (updates: Partial<EditAdvancedSettingsType>) => void;
}

interface EditModePanelStateOverrides {
  coreState?: Pick<LightboxCoreState, 'onClose'>;
  imageEditState?: ImageEditState;
  variantsState?: Pick<LightboxVariantState,
    | 'variants'
    | 'activeVariant'
    | 'handleVariantSelect'
    | 'handleMakePrimary'
    | 'isLoadingVariants'
    | 'handlePromoteToGeneration'
    | 'isPromoting'
    | 'handleDeleteVariant'
    | 'onLoadVariantSettings'
  >;
}

export interface EditModePanelProps {
  /** Layout variant */
  variant: 'desktop' | 'mobile';
  hideInfoEditToggle?: boolean;
  /**
   * Simplified header mode for page views (edit-images, edit-video tools).
   * When true, shows only [ModeSelector | X button] in header.
   * When false (default), shows full header with id copy, variants link, pending badge, etc.
   */
  simplifiedHeader?: boolean;

  // Task ID for copy functionality
  taskId?: string | null;

  // Current media ID (for tracking prompt changes)
  currentMediaId: string;

  // Grouped behavior/config props
  actions: EditModePanelActions;
  upscale?: EditModePanelUpscaleControls;
  lora?: EditModePanelLoraControls;
  advanced?: EditModePanelAdvancedConfig;

  // Whether running in local generation mode (shows steps slider)
  isLocalGeneration?: boolean;

  // Optional state overrides (props-first pattern)
  stateOverrides?: EditModePanelStateOverrides;
}
