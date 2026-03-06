import type { LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import type { PresetMetadata, PresetSampleGeneration } from '@/shared/types/presetMetadata';
import type { ActiveLora } from '@/domains/lora/types/lora';
import type { PhaseConfig } from '../settings';

export type GenerationTypeMode = 'i2v' | 'vace';

interface MotionControlModeProps {
  motionMode: 'basic' | 'advanced';
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
  generationTypeMode?: GenerationTypeMode;
  onGenerationTypeModeChange?: (mode: GenerationTypeMode) => void;
  hasStructureVideo?: boolean;
}

interface MotionControlLoraProps {
  selectedLoras: ActiveLora[];
  availableLoras: LoraModel[];
  onAddLoraClick: () => void;
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, strength: number) => void;
  onAddTriggerWord?: (trigger: string) => void;
  renderLoraHeaderActions?: () => React.ReactNode;
}

interface MotionControlCurrentSettings {
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  basePrompt?: string;
  negativePrompt?: string;
  enhancePrompt?: boolean;
  durationFrames?: number;
  lastGeneratedVideoUrl?: string;
  selectedLoras?: Array<{ id: string; name: string; strength: number }>;
}

interface MotionControlPresetProps {
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  onPhasePresetRemove: () => void;
  currentSettings: MotionControlCurrentSettings;
  featuredPresetIds?: string[];
}

interface MotionControlAdvancedProps {
  phaseConfig?: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onBlurSave?: () => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
  onRestoreDefaults?: () => void;
}

interface MotionControlStateOverrides {
  turboMode?: boolean;
  settingsLoading?: boolean;
  smoothContinuations?: boolean;
  onSmoothContinuationsChange?: (value: boolean) => void;
}

export interface MotionControlProps {
  mode: MotionControlModeProps;
  lora: MotionControlLoraProps;
  presets: MotionControlPresetProps;
  advanced: MotionControlAdvancedProps;
  stateOverrides?: MotionControlStateOverrides;
}

export interface MotionPresetMetadata extends PresetMetadata {
  name: string;
  description: string;
  phaseConfig: PhaseConfig;
  sample_generations?: PresetSampleGeneration[];
}

export interface MotionPresetOption {
  id: string;
  metadata: MotionPresetMetadata;
}

export interface PhasePresetSelection {
  id: string;
  metadata?: ({
    phaseConfig?: PhaseConfig;
    phase_config?: PhaseConfig;
  } & PresetMetadata) | null;
}
