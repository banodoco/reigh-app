import type { ReactNode } from 'react';
import { PhaseConfig } from '@/shared/types/phaseConfig';
import type { LoraModel } from '@/domains/lora/types/lora';

export type MotionMode = 'basic' | 'advanced';
type GenerationTypeMode = 'i2v' | 'vace';

export interface PresetSampleGeneration {
  url: string;
  type: 'video' | 'image';
  alt_text?: string;
}

export interface PresetMetadata {
  name: string;
  description?: string;
  phaseConfig: PhaseConfig;
  generationTypeMode?: GenerationTypeMode;
  sample_generations?: PresetSampleGeneration[];
  is_public?: boolean;
  use_count?: number;
  tags?: string[];
}

export interface BuiltinPreset {
  id: string;
  metadata: PresetMetadata & {
    description: string;
    generationTypeMode: GenerationTypeMode;
  };
}

interface DatabasePreset {
  id: string;
  metadata: PresetMetadata;
  createdAt?: string;
  _isMyPreset?: boolean;
}

export type Preset = BuiltinPreset | DatabasePreset;

export interface MotionPresetSelectorProps {
  builtinPreset: BuiltinPreset;
  featuredPresetIds?: string[];
  generationTypeMode: GenerationTypeMode;
  selectedPhasePresetId: string | null;
  phaseConfig?: PhaseConfig;
  motionMode: MotionMode;
  onPresetSelect: (presetId: string, config: PhaseConfig, metadata?: PresetMetadata) => void;
  onPresetRemove: () => void;
  onModeChange: (mode: MotionMode) => void;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onRestoreDefaults?: () => void;
  availableLoras?: LoraModel[];
  randomSeed?: boolean;
  onRandomSeedChange?: (value: boolean) => void;
  advancedDisabled?: boolean;
  advancedDisabledReason?: string;
  presetTooltip?: string;
  renderBasicModeContent?: () => ReactNode;
  queryKeyPrefix?: string;
  labelSuffix?: ReactNode;
}

export interface SelectedPresetCardProps {
  presetId: string;
  onSwitchToAdvanced: () => void;
  onChangePreset: () => void;
  onRemove?: () => void;
  queryKeyPrefix?: string;
}

export interface UseMotionPresetsReturn {
  allPresets: Preset[];
  allKnownPresetIds: string[];
  shouldShowPresetChips: boolean;
  isCustomConfig: boolean;
  isUsingBuiltinDefault: boolean;
  isLoading: boolean;
}
