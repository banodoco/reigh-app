import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { LoraModel } from '@/shared/components/LoraSelectorModal/types';
import type { VideoMetadata } from '@/shared/lib/media/videoUploader';

export interface TaskData {
  params: Record<string, unknown>;
  orchestrator: Record<string, unknown>;
}

export interface ExtractedSettings {
  // Prompts
  prompt?: string;
  prompts?: string[];
  negativePrompt?: string;
  negativePrompts?: string[];

  // Generation settings
  steps?: number;
  frames?: number; // Legacy: single value for uniform spacing
  segmentFramesExpanded?: number[]; // NEW: array of gaps between successive frames
  context?: number;
  model?: string;

  // Input images (for image replacement)
  inputImages?: string[];

  // Modes
  generationMode?: 'batch' | 'timeline' | 'by-pair';
  generationTypeMode?: 'i2v' | 'vace'; // I2V vs VACE mode
  advancedMode?: boolean;
  motionMode?: 'basic' | 'advanced';

  // Advanced mode settings
  phaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string | null;
  turboMode?: boolean;
  enhancePrompt?: boolean;

  // Text addons
  textBeforePrompts?: string;
  textAfterPrompts?: string;

  // Motion
  amountOfMotion?: number;

  // LoRAs
  loras?: Array<{ path: string; strength: number }>;

  // Structure video
  structureVideos?: StructureVideoConfigWithMetadata[];
  structureVideoPath?: string | null;
  structureVideoTreatment?: 'adjust' | 'clip';
  structureVideoMotionStrength?: number;
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth';
}

export interface ApplyResult {
  success: boolean;
  settingName: string;
  error?: string;
  details?: Record<string, unknown> | string;
}

export interface ApplyContext {
  // Current state
  currentGenerationMode: 'batch' | 'timeline' | 'by-pair';
  currentAdvancedMode: boolean;

  // Callbacks for applying settings
  onBatchVideoPromptChange: (prompt: string) => void;
  onSteerableMotionSettingsChange: (settings: { model_name?: string; negative_prompt?: string }) => void;
  onBatchVideoFramesChange: (frames: number) => void;
  onBatchVideoStepsChange: (steps: number) => void;
  onGenerationModeChange: (mode: 'batch' | 'timeline' | 'by-pair') => void;
  onAdvancedModeChange: (advanced: boolean) => void;
  onMotionModeChange?: (mode: 'basic' | 'advanced') => void;
  onGenerationTypeModeChange?: (mode: 'i2v' | 'vace') => void;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onPhasePresetSelect?: (presetId: string, config: PhaseConfig) => void;
  onPhasePresetRemove?: () => void;
  onTurboModeChange?: (turbo: boolean) => void;
  onEnhancePromptChange?: (enhance: boolean) => void;
  onTextBeforePromptsChange?: (text: string) => void;
  onTextAfterPromptsChange?: (text: string) => void;
  onAmountOfMotionChange?: (motion: number) => void;

  // Structure video
  onStructureVideoInputChange: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
  ) => void;

  // LoRAs
  loraManager: {
    setSelectedLoras?: (loras: Array<{ id: string; name: string; path: string; strength: number; [key: string]: unknown }>) => void;
    handleAddLora: (lora: LoraModel, showToast: boolean, strength: number) => void;
  };
  availableLoras: LoraModel[];

  // Pair prompts (for timeline mode)
  updatePairPromptsByIndex?: (index: number, prompt: string, negativePrompt: string) => Promise<void>;

  // Current values for comparison
  steerableMotionSettings: { model_name: string };
  batchVideoFrames: number;
  batchVideoSteps: number;
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  turboMode?: boolean;
  enhancePrompt?: boolean;
  amountOfMotion?: number;
  motionMode?: 'basic' | 'advanced';
  generationTypeMode?: 'i2v' | 'vace';
}
