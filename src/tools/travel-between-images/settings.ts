// =============================================================================
// RE-EXPORTS FROM SHARED
// These types were moved to shared/ because they're used across multiple tools.
// Re-exported here for backwards compatibility with existing imports.
// =============================================================================
export {
  type PhaseConfig,
  DEFAULT_PHASE_CONFIG,
  DEFAULT_VACE_PHASE_CONFIG,
  buildBasicModePhaseConfig,
} from '@/shared/types/phaseConfig';

// Import for local use
import {
  type SteerableMotionSettings,
  DEFAULT_STEERABLE_MOTION_SETTINGS,
} from '@/shared/types/steerableMotion';

// =============================================================================
// TOOL-SPECIFIC TYPES
// =============================================================================

// LoRA type for shot settings (simplified version of ActiveLora for persistence)
export interface ShotLora {
  id: string;
  name: string;
  path: string;
  strength: number;
  previewImageUrl?: string;
  trigger_word?: string;
}

export interface VideoTravelSettings {
  videoControlMode: 'individual' | 'batch';
  prompt: string;  // Main prompt for video generation (was batchVideoPrompt)
  negativePrompt?: string;  // Negative prompt (was steerableMotionSettings.negative_prompt)
  batchVideoFrames: number;
  batchVideoSteps: number;
  dimensionSource?: 'project' | 'firstImage' | 'custom'; // DEPRECATED - now using aspect ratios only
  customWidth?: number; // DEPRECATED - now using aspect ratios only
  customHeight?: number; // DEPRECATED - now using aspect ratios only
  steerableMotionSettings: SteerableMotionSettings;  // Still used for seed, debug, model_name
  enhancePrompt: boolean;
  generationMode: 'batch' | 'by-pair' | 'timeline';
  selectedModel?: 'wan-2.1' | 'wan-2.2';
  turboMode: boolean;
  amountOfMotion: number; // 0-100 range for UI (kept for backward compatibility)
  motionMode?: 'basic' | 'advanced'; // Motion control mode (Presets tab merged into Basic)
  advancedMode: boolean; // Toggle for showing phase_config settings
  phaseConfig?: PhaseConfig; // Advanced phase configuration
  selectedPhasePresetId?: string | null; // ID of the selected phase config preset (null if manually configured)
  textBeforePrompts?: string; // Text to prepend to all prompts
  textAfterPrompts?: string; // Text to append to all prompts
  generationTypeMode?: 'i2v' | 'vace'; // Generation type: I2V (image-to-video) or VACE (structure video guided)
  smoothContinuations?: boolean; // Enable SVI (smooth video interpolation) for smoother transitions
  // selectedMode removed - now hardcoded to use specific model
  pairConfigs?: Array<{
    id: string;
    prompt: string;
    frames: number;
    negativePrompt: string;
    context: number;
  }>;
  // Store the shot images as part of settings
  shotImageIds?: string[];
  // LoRAs for this shot (unified field name after DB migration)
  loras?: ShotLora[];
  // Structure video settings (per-shot basis)
  structureVideo?: {
    path: string;
    metadata: {
      duration_seconds: number;
      frame_rate: number;
      total_frames: number;
      width: number;
      height: number;
      file_size: number;
    };
    treatment: 'adjust' | 'clip';
    motionStrength: number;
    structureType?: 'uni3c' | 'flow' | 'canny' | 'depth';
  };
}

export const videoTravelSettings = {
  id: 'travel-between-images',
  scope: ['shot'], // Video travel settings are per-shot
  defaults: {
    // Content fields - explicit empty defaults
    // These do NOT inherit to new shots (cleared in shotSettingsInheritance.ts)
    prompt: '',  // Main prompt for video generation
    negativePrompt: '',  // Negative prompt
    pairConfigs: [],
    shotImageIds: [],
    phaseConfig: undefined,
    structureVideo: undefined,
    textBeforePrompts: '',
    textAfterPrompts: '',
    
    // Configuration fields - these inherit to both new shots and new projects
    videoControlMode: 'batch' as const,
    batchVideoFrames: 61, // Must be 4N+1 format for Wan model compatibility (61 = 4*15+1)
    batchVideoSteps: 6,
    dimensionSource: 'firstImage' as const,
    generationMode: 'timeline' as const,
    enhancePrompt: true,
    selectedModel: 'wan-2.1' as const,
    turboMode: false,
    amountOfMotion: 50,
    motionMode: 'basic' as const,
    advancedMode: false,
    selectedMode: 'Zippy Supreme' as const,
    steerableMotionSettings: DEFAULT_STEERABLE_MOTION_SETTINGS,
    customWidth: undefined,
    customHeight: undefined,
    generationTypeMode: 'i2v' as const, // Default to I2V (image-to-video) mode
    smoothContinuations: false, // SVI disabled for now
  },
}; 