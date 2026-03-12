// Import API types from shared (used in interfaces below, re-exported at bottom)
import { ReferenceMode } from '@/shared/lib/tasks/families/imageGeneration';
import {
  DEFAULT_HIRES_FIX_CONFIG,
  getHiresFixDefaultsForModel,
  type HiresFixConfig,
  type ResolutionMode,
} from '@/shared/lib/imageGeneration/hiresFixConfig';
import type { ActiveLora } from '@/domains/lora/types/lora';
import type { ReferenceImage } from '@/shared/types/referenceImage';
import type { HydratedReferenceImage as SharedHydratedReferenceImage } from '@/shared/types/referenceHydration';

export type GenerationMode = 'wan-local' | 'qwen-image';

export type PromptMode = 'managed' | 'automated';

// Generation source: whether to use a reference image or just text prompts
export type GenerationSource = 'by-reference' | 'just-text';

// Available models for "just text" mode
export type TextToImageModel = 'qwen-image' | 'qwen-image-2512' | 'z-image';

export const TEXT_TO_IMAGE_MODELS: { id: TextToImageModel; name: string; description: string; loraType: string }[] = [
  { id: 'qwen-image', name: 'Qwen Image', description: 'Default Qwen model', loraType: 'Qwen Image' },
  { id: 'qwen-image-2512', name: 'Qwen Image 2512', description: 'Higher resolution Qwen', loraType: 'Qwen Image 2512' },
  { id: 'z-image', name: 'Z-Image', description: 'Z-Image model', loraType: 'Z-Image' },
];

// LoRA type for "by reference" mode (always Qwen Image)
export const BY_REFERENCE_LORA_TYPE = 'Qwen Image';

// Get the LoRA type for a given text-to-image model
export function getLoraTypeForModel(model: TextToImageModel): string {
  return TEXT_TO_IMAGE_MODELS.find(m => m.id === model)?.loraType ?? 'Qwen Image';
}

export interface PromptEntry {
  id: string;
  fullPrompt: string;
  shortPrompt?: string;
  selected?: boolean;
}

/**
 * Shot-scoped settings for image generation prompts.
 * Stored per-shot in shots.settings['image-gen-prompts']
 * Uses useAutoSaveSettings for automatic persistence.
 */
export interface ImageGenShotSettings extends Record<string, unknown> {
  prompts: PromptEntry[];
  /** Master prompt for automated mode */
  masterPrompt: string;
  promptMode?: PromptMode;
  selectedReferenceId?: string | null;
  /** Defaults to empty, not inherited between shots */
  beforeEachPromptText?: string;
  /** Defaults to empty, not inherited between shots */
  afterEachPromptText?: string;
}

// Re-export canonical ReferenceImage from shared for backwards compatibility
export type { ReferenceImage } from '@/shared/types/referenceImage';

// Shared hydration contract
export type HydratedReferenceImage = SharedHydratedReferenceImage;

// LoRA category for storage - Qwen models and by-reference share one bucket, Z-Image has its own
export type LoraCategory = 'qwen' | 'z-image';

// Get the LoRA category for a given model (used for per-category LORA storage)
// Any model starting with 'z-' is categorized as z-image, everything else is qwen
export function getLoraCategoryForModel(model: TextToImageModel): LoraCategory {
  return model.startsWith('z-') ? 'z-image' : 'qwen';
}

// Project-level settings for model and style reference
// Note: Prompt-related no-shot settings (prompts, masterPrompt, promptMode, beforeEachPromptText,
// afterEachPromptText, associatedShotId) are persisted via usePersistentToolState with toolId='image-generation'.
// This interface stores model selection and reference image settings in 'project-image-settings'.
export interface ProjectImageSettings extends Record<string, unknown> {
  selectedModel?: GenerationMode;
  generationSource?: GenerationSource;
  selectedTextModel?: TextToImageModel;
  /** Per-category LoRA selections: 'qwen' (shared by all Qwen models + by-reference) and 'z-image' */
  selectedLorasByCategory?: Record<LoraCategory, ActiveLora[]>;
  selectedReferenceIdByShot?: Record<string, string | null>;
  references?: ReferenceImage[];
}

export interface PromptInputRowProps {
  promptEntry: PromptEntry;
  onUpdate: (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
  isGenerating?: boolean;
  index: number;
  totalPrompts?: number;
  onEditWithAI?: () => void;
  aiEditButtonIcon?: React.ReactNode;
  onSetActiveForFullView: (id: string | null) => void;
  isActiveForFullView: boolean;
  forceExpanded?: boolean;
  /**
   * When true on mobile, entering active full-view automatically switches into typing mode.
   */
  autoEnterEditWhenActive?: boolean;
  /**
   * Optional custom content to render on the right side of the header.
   * When provided, it replaces the default AI edit icon button, but retains
   * the remove button (if allowed).
   */
  rightHeaderAddon?: React.ReactNode;
  /**
   * When true on mobile, hides the header label and remove button and
   * allows the right header addon to expand to full width.
   */
  mobileInlineEditing?: boolean;
  /**
   * When true, hides the remove button regardless of platform.
   */
  hideRemoveButton?: boolean;
}

// Re-export ActiveLora from shared component
export type { ActiveLora } from "@/domains/lora/types/lora";
export {
  DEFAULT_HIRES_FIX_CONFIG,
  getHiresFixDefaultsForModel,
};
export type {
  HiresFixConfig,
  ResolutionMode,
};

// ============================================================================
// Re-export API types from shared (single source of truth)
// ============================================================================
export type { ReferenceApiParams, ReferenceMode } from '@/shared/lib/tasks/families/imageGeneration';


// ============================================================================
// Hires Fix / Two-Pass Generation Settings (UI config)
// ============================================================================

// ============================================================================
// Reference Mode Strength Defaults
// ============================================================================

interface ReferenceModeStrengths {
  styleReferenceStrength: number;
  subjectStrength: number;
  inThisSceneStrength: number;
  inThisScene: boolean;
}

/** Default strength values for each reference mode, by generation environment (internal, used by getReferenceModeDefaults) */
const REFERENCE_MODE_DEFAULTS: Record<'local' | 'cloud', Record<ReferenceMode, ReferenceModeStrengths>> = {
  local: {
    style: { styleReferenceStrength: 1.1, subjectStrength: 0, inThisSceneStrength: 0, inThisScene: false },
    subject: { styleReferenceStrength: 0.4, subjectStrength: 1.0, inThisSceneStrength: 0, inThisScene: false },
    'style-character': { styleReferenceStrength: 0.4, subjectStrength: 1.0, inThisSceneStrength: 0, inThisScene: false },
    scene: { styleReferenceStrength: 0.4, subjectStrength: 0, inThisSceneStrength: 1.0, inThisScene: true },
    custom: { styleReferenceStrength: 0.8, subjectStrength: 0.8, inThisSceneStrength: 0, inThisScene: false },
  },
  cloud: {
    style: { styleReferenceStrength: 1.1, subjectStrength: 0, inThisSceneStrength: 0, inThisScene: false },
    subject: { styleReferenceStrength: 1.1, subjectStrength: 0.4, inThisSceneStrength: 0, inThisScene: false },
    'style-character': { styleReferenceStrength: 1.1, subjectStrength: 0.4, inThisSceneStrength: 0, inThisScene: false },
    scene: { styleReferenceStrength: 1.1, subjectStrength: 0, inThisSceneStrength: 0.4, inThisScene: true },
    custom: { styleReferenceStrength: 0.8, subjectStrength: 0.8, inThisSceneStrength: 0, inThisScene: false },
  },
};

/** Get the default strength values for a given reference mode and generation environment */
export function getReferenceModeDefaults(mode: ReferenceMode, isLocalGeneration: boolean): ReferenceModeStrengths {
  const env = isLocalGeneration ? 'local' : 'cloud';
  return REFERENCE_MODE_DEFAULTS[env][mode] ?? REFERENCE_MODE_DEFAULTS[env].style;
}
