import type { LoraModel } from '@/domains/lora/types/lora';
import type { PresetMetadata, PresetSampleGeneration } from '@/shared/types/presetMetadata';
import type { ActiveLora } from '@/domains/lora/types/lora';
import type { CurrentSettings } from '@/shared/components/PhaseConfigSelectorModal/types';
import type { TravelGuidanceMode } from '@/shared/lib/tasks/travelGuidance';
import type { PhaseConfig } from '../settings';
import type { SelectedModel } from '../settings';

export type GenerationTypeMode = 'i2v' | 'vace';

interface MotionControlModeProps {
  motionMode: 'basic' | 'advanced';
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
  selectedModel: SelectedModel;
  generationTypeMode?: GenerationTypeMode;
  onGenerationTypeModeChange?: (mode: GenerationTypeMode) => void;
  hasStructureVideo?: boolean;
  guidanceKind?: TravelGuidanceMode;
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

interface MotionControlPresetProps {
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  onPhasePresetRemove: () => void;
  currentSettings: CurrentSettings;
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
  /** Do not persist a built-in preset selection just because the editor mounted. */
  suppressDefaultPresetAutoSelect?: boolean;
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
