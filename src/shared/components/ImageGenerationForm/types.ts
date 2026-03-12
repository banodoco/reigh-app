// Import API types from shared (used in interfaces below, re-exported at bottom)
import { ReferenceMode } from '@/shared/lib/tasks/families/imageGeneration';
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

// ============================================================================
// Re-export API types from shared (single source of truth)
// ============================================================================
export type { ReferenceApiParams, ReferenceMode } from '@/shared/lib/tasks/families/imageGeneration';


// ============================================================================
// Hires Fix / Two-Pass Generation Settings (UI config)
// ============================================================================

/**
 * Per-LoRA phase strength override for two-pass hires fix generation.
 * Allows different LoRA strengths for the initial pass vs the upscaling pass.
 */
interface PhaseLoraStrength {
  /** References ActiveLora.id for syncing with base LoRA selection */
  loraId: string;
  /** LoRA file URL for task payload */
  loraPath: string;
  /** Display name */
  loraName: string;
  /** Strength for initial pass (0-2) */
  pass1Strength: number;
  /** Strength for upscaling/hires pass (0-2) */
  pass2Strength: number;
}

/** Resolution mode for image generation */
export type ResolutionMode = 'project' | 'custom';

/**
 * Configuration for two-pass hires fix image generation.
 * When enabled, generates at base resolution then upscales with refinement.
 *
 * Uses snake_case to match API params directly - no conversion needed.
 */
export interface HiresFixConfig {
  /** Whether hires fix is enabled (UI only) */
  enabled: boolean;
  /** Resolution mode: 'project' uses project dimensions, 'custom' allows selecting aspect ratio */
  resolution_mode: ResolutionMode;
  /** Custom aspect ratio when resolution_mode is 'custom' (e.g., "16:9") */
  custom_aspect_ratio?: string;
  /** Scale factor for initial resolution vs base resolution (1.0-2.5x) */
  resolution_scale: number;
  /** Number of inference steps for base pass (maps to `steps` in API) */
  base_steps: number;
  /** Upscale factor for hires pass (e.g., 2.0 = 2x resolution) */
  hires_scale: number;
  /** Number of steps for hires/refinement pass */
  hires_steps: number;
  /** Denoising strength for hires pass (0-1) */
  hires_denoise: number;
  /** Lightning LoRA strength for phase 1 (initial generation, 0-1) */
  lightning_lora_strength_phase_1: number;
  /** Lightning LoRA strength for phase 2 (hires/refinement pass, 0-1) */
  lightning_lora_strength_phase_2: number;
  /** Per-LoRA phase strength overrides (UI structure, transforms to additional_loras) */
  phaseLoraStrengths: PhaseLoraStrength[];
}

/** Default hires fix configuration (used as fallback) */
export const DEFAULT_HIRES_FIX_CONFIG: HiresFixConfig = {
  enabled: true,
  resolution_mode: 'project',
  resolution_scale: 1.5,
  base_steps: 8,
  hires_scale: 1.1,
  hires_steps: 8,
  hires_denoise: 0.55,
  lightning_lora_strength_phase_1: 0.9,
  lightning_lora_strength_phase_2: 0.5,
  phaseLoraStrengths: [],
};

/** Model-specific hires fix defaults (internal, used by getHiresFixDefaultsForModel) */
const MODEL_HIRES_FIX_DEFAULTS: Record<string, HiresFixConfig> = {
  // Qwen Image - used for by-reference mode and just-text qwen-image
  'qwen-image': {
    enabled: true,
    resolution_mode: 'project',
    resolution_scale: 1.5,
    base_steps: 8,
    hires_scale: 1.1,
    hires_steps: 8,
    hires_denoise: 0.55,
    lightning_lora_strength_phase_1: 0.9,
    lightning_lora_strength_phase_2: 0.5,
    phaseLoraStrengths: [],
  },
  // Qwen Image 2512 - higher resolution variant
  'qwen-image-2512': {
    enabled: true,
    resolution_mode: 'project',
    resolution_scale: 1.5,
    base_steps: 10,
    hires_scale: 1.0,
    hires_steps: 8,
    hires_denoise: 0.5,
    lightning_lora_strength_phase_1: 0.85,
    lightning_lora_strength_phase_2: 0.4,
    phaseLoraStrengths: [],
  },
  // Z-Image model
  'z-image': {
    enabled: true,
    resolution_mode: 'project',
    resolution_scale: 1.5,
    base_steps: 12,
    hires_scale: 1.2,
    hires_steps: 10,
    hires_denoise: 0.6,
    lightning_lora_strength_phase_1: 0.8,
    lightning_lora_strength_phase_2: 0.3,
    phaseLoraStrengths: [],
  },
};

/** Get the default hires fix config for a given model */
export function getHiresFixDefaultsForModel(modelName: string): HiresFixConfig {
  return MODEL_HIRES_FIX_DEFAULTS[modelName] ?? DEFAULT_HIRES_FIX_CONFIG;
}

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
