import type { LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import type { PhaseConfig, PhaseSettings } from '@/shared/types/phaseConfig';
import type { PresetMetadata } from '@/shared/types/presetMetadata';

export interface PhaseConfigVerticalProps {
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onBlurSave?: () => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
  availableLoras?: LoraModel[];
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect?: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  onPhasePresetRemove?: () => void;
  currentSettings?: {
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    basePrompt?: string;
    negativePrompt?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    lastGeneratedVideoUrl?: string;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
  };
  generationTypeMode?: 'i2v' | 'vace';
  onRestoreDefaults?: () => void;
}

export interface PhaseGlobalSettingsProps {
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
}

export interface PerPhaseCardProps {
  phaseConfig: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  phaseIdx: number;
  phase: PhaseSettings;
  label: string;
  availableLoras: LoraModel[];
  focusedLoraInput: string | null;
  onFocusLoraInput: (id: string | null) => void;
  onOpenLoraModal: (phaseIdx: number) => void;
  onBlurSave?: () => void;
}
