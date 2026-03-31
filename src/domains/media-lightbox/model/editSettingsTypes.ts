export type EditMode = 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img' | 'upscale';
export type LoraMode = 'none' | 'in-scene' | 'next-scene' | 'custom';
export type QwenEditModel = 'qwen-edit' | 'qwen-edit-2509' | 'qwen-edit-2511';
export type VideoEditSubMode = 'trim' | 'replace' | 'regenerate' | 'enhance';
export type PanelMode = 'info' | 'edit';

export interface EditAdvancedSettings {
  enabled: boolean;
  num_inference_steps: number;
  resolution_scale: number;
  base_steps: number;
  hires_scale: number;
  hires_steps: number;
  hires_denoise: number;
  lightning_lora_strength_phase_1: number;
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

export interface VideoEnhanceSettings {
  enableInterpolation: boolean;
  enableUpscale: boolean;
  numFrames: number;
  upscaleFactor: number;
  colorFix: boolean;
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

interface PerGenerationOnlySettings {
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

interface UserPreferenceSettings {
  editMode: EditMode;
  videoEditSubMode: VideoEditSubMode;
  panelMode: PanelMode;
}

const DEFAULT_USER_PREFERENCE_SETTINGS: UserPreferenceSettings = {
  editMode: 'text',
  videoEditSubMode: 'trim',
  panelMode: 'info',
};

export interface GenerationEditSettings extends SyncedEditSettings, PerGenerationOnlySettings {
  editMode: EditMode;
}

export interface EditSettingsSetterMethods {
  setEditMode: (mode: EditMode) => void;
  setLoraMode: (mode: LoraMode) => void;
  setCustomLoraUrl: (url: string) => void;
  setNumGenerations: (num: number) => void;
  setPrompt: (prompt: string) => void;
  setQwenEditModel: (model: QwenEditModel) => void;
  setImg2imgPrompt: (prompt: string) => void;
  setImg2imgStrength: (strength: number) => void;
  setImg2imgEnablePromptExpansion: (enabled: boolean) => void;
  setAdvancedSettings: (settings: Partial<EditAdvancedSettings>) => void;
  setEnhanceSettings: (settings: Partial<VideoEnhanceSettings>) => void;
  setCreateAsGeneration: (value: boolean) => void;
}

export const DEFAULT_EDIT_SETTINGS: GenerationEditSettings = {
  ...DEFAULT_SYNCED_SETTINGS,
  ...DEFAULT_PER_GENERATION_SETTINGS,
  editMode: 'text',
};

export interface LastUsedEditSettings extends SyncedEditSettings, UserPreferenceSettings {}

export const DEFAULT_LAST_USED: LastUsedEditSettings = {
  ...DEFAULT_SYNCED_SETTINGS,
  ...DEFAULT_USER_PREFERENCE_SETTINGS,
};

type SyncedSettingKey = keyof SyncedEditSettings;

export const SYNCED_SETTING_KEYS: SyncedSettingKey[] = [
  'loraMode',
  'customLoraUrl',
  'numGenerations',
  'img2imgStrength',
  'img2imgEnablePromptExpansion',
  'advancedSettings',
  'createAsGeneration',
];
