/**
 * Canonical type definitions for edit settings.
 *
 * This is the single source of truth for all edit settings types.
 * Other files (EditFormContext, inpainting/types, etc.) should import from here.
 *
 * Settings are categorized by where they are persisted:
 * - SyncedEditSettings: Saved to BOTH per-generation AND "last used"
 * - PerGenerationOnlySettings: Saved to per-generation only (prompts, etc.)
 * - UserPreferenceSettings: Saved to "last used" only (UI mode preferences)
 */

// ============================================================================
// Enums / Literal Types
// ============================================================================

/** Edit mode - which editing interface is active */
export type EditMode = 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img' | 'enhance';

/** LoRA preset mode */
export type LoraMode = 'none' | 'in-scene' | 'next-scene' | 'custom';

/** Qwen model variant for cloud mode */
export type QwenEditModel = 'qwen-edit' | 'qwen-edit-2509' | 'qwen-edit-2511';

/** Video edit sub-mode */
export type VideoEditSubMode = 'trim' | 'replace' | 'regenerate';

/** Panel mode - Info vs Edit panel */
export type PanelMode = 'info' | 'edit';

// ============================================================================
// Advanced Settings (Two-Pass Generation)
// ============================================================================

/**
 * Advanced settings for image editing tasks.
 * Controls two-pass generation quality settings.
 */
export interface EditAdvancedSettings {
  /** Whether two-pass generation is enabled */
  enabled: boolean;
  /** Number of inference steps for single-pass generation (when two-pass disabled) */
  num_inference_steps: number;
  /** Scale factor for initial resolution (1.0-2.5x) */
  resolution_scale: number;
  /** Number of inference steps for base pass (when two-pass enabled) */
  base_steps: number;
  /** Upscale factor for hires pass (e.g., 1.1 = 10% upscale) */
  hires_scale: number;
  /** Number of steps for hires/refinement pass */
  hires_steps: number;
  /** Denoising strength for hires pass (0-1) */
  hires_denoise: number;
  /** Lightning LoRA strength for phase 1 (initial generation, 0-1) */
  lightning_lora_strength_phase_1: number;
  /** Lightning LoRA strength for phase 2 (hires/refinement pass, 0-1) */
  lightning_lora_strength_phase_2: number;
}

export const DEFAULT_ADVANCED_SETTINGS: EditAdvancedSettings = {
  enabled: false,
  num_inference_steps: 12,
  resolution_scale: 1.5,
  base_steps: 8,
  hires_scale: 1.1,
  hires_steps: 8,
  hires_denoise: 0.5,
  lightning_lora_strength_phase_1: 0.9,
  lightning_lora_strength_phase_2: 0.5,
};

// ============================================================================
// Video Enhance Settings
// ============================================================================

/**
 * Video enhance settings for interpolation and upscaling
 */
export interface VideoEnhanceSettings {
  /** Enable frame interpolation (FILM) */
  enableInterpolation: boolean;
  /** Enable video upscaling (FlashVSR) */
  enableUpscale: boolean;
  /** Frames to add between each pair (1-4) */
  numFrames: number;
  /** Upscale factor (1-4) */
  upscaleFactor: number;
  /** Enable color correction for upscaling */
  colorFix: boolean;
  /** Output quality for upscaling */
  outputQuality: 'low' | 'medium' | 'high' | 'maximum';
}

export const DEFAULT_ENHANCE_SETTINGS: VideoEnhanceSettings = {
  enableInterpolation: false,
  enableUpscale: true,
  numFrames: 1,
  upscaleFactor: 2,
  colorFix: true,
  outputQuality: 'maximum',
};

// ============================================================================
// Categorized Settings
// ============================================================================

/**
 * Settings that are synced between per-generation storage AND "last used" storage.
 * When these change, both storage locations are updated.
 */
export interface SyncedEditSettings {
  loraMode: LoraMode;
  customLoraUrl: string;
  numGenerations: number;
  img2imgStrength: number;
  img2imgEnablePromptExpansion: boolean;
  advancedSettings: EditAdvancedSettings;
  createAsGeneration: boolean;
}

const DEFAULT_SYNCED_SETTINGS: SyncedEditSettings = {
  loraMode: 'none',
  customLoraUrl: '',
  numGenerations: 1,
  img2imgStrength: 0.6,
  img2imgEnablePromptExpansion: false,
  advancedSettings: DEFAULT_ADVANCED_SETTINGS,
  createAsGeneration: false,
};

/**
 * Settings only stored per-generation (not inherited to new generations).
 * Prompts and generation-specific options.
 */
export interface PerGenerationOnlySettings {
  prompt: string;
  img2imgPrompt: string;
  img2imgPromptHasBeenSet: boolean;
  qwenEditModel: QwenEditModel;
  enhanceSettings: VideoEnhanceSettings;
}

const DEFAULT_PER_GENERATION_SETTINGS: PerGenerationOnlySettings = {
  prompt: '',
  img2imgPrompt: '',
  img2imgPromptHasBeenSet: false,
  qwenEditModel: 'qwen-edit-2511',
  enhanceSettings: DEFAULT_ENHANCE_SETTINGS,
};

/**
 * Settings only stored at user level (preferences that persist across generations).
 * These control UI state, not generation parameters.
 */
export interface UserPreferenceSettings {
  editMode: EditMode;
  videoEditSubMode: VideoEditSubMode;
  panelMode: PanelMode;
}

const DEFAULT_USER_PREFERENCE_SETTINGS: UserPreferenceSettings = {
  editMode: 'text',
  videoEditSubMode: 'trim',
  panelMode: 'info',
};

// ============================================================================
// Composed Types (for backwards compatibility)
// ============================================================================

/**
 * Full per-generation settings.
 * Stored in generations.params.ui.editSettings
 */
export interface GenerationEditSettings extends SyncedEditSettings, PerGenerationOnlySettings {
  // editMode is included for backwards compatibility but is overridden by UserPreferenceSettings
  // when reading effective values
  editMode: EditMode;
}

export const DEFAULT_EDIT_SETTINGS: GenerationEditSettings = {
  ...DEFAULT_SYNCED_SETTINGS,
  ...DEFAULT_PER_GENERATION_SETTINGS,
  editMode: 'text',
};

/**
 * "Last used" settings - stored at user/project level.
 * Used as defaults when opening a generation for the first time.
 */
export interface LastUsedEditSettings extends SyncedEditSettings, UserPreferenceSettings {}

export const DEFAULT_LAST_USED: LastUsedEditSettings = {
  ...DEFAULT_SYNCED_SETTINGS,
  ...DEFAULT_USER_PREFERENCE_SETTINGS,
};

// ============================================================================
// Utility Types
// ============================================================================

/** Keys of settings that sync between per-generation and last-used */
export type SyncedSettingKey = keyof SyncedEditSettings;

/** All synced setting keys for iteration */
export const SYNCED_SETTING_KEYS: SyncedSettingKey[] = [
  'loraMode',
  'customLoraUrl',
  'numGenerations',
  'img2imgStrength',
  'img2imgEnablePromptExpansion',
  'advancedSettings',
  'createAsGeneration',
];
