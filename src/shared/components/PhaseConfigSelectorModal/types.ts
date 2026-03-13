import type { Resource, PhaseConfigMetadata } from '@/features/resources/hooks/useResources';
import type { PhaseConfig, PhaseSettings } from '@/shared/types/phaseConfig';
import type { LoraModel } from '@/domains/lora/types/lora';
import type { PresetMetadata } from '@/shared/types/presetMetadata';

export type SortOption = 'default' | 'newest' | 'oldest' | 'mostUsed' | 'name';

export type ModelTypeFilter = 'all' | 'i2v' | 'vace';

export interface CurrentSettings {
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  basePrompt?: string;
  negativePrompt?: string;
  enhancePrompt?: boolean;
  durationFrames?: number;
  lastGeneratedVideoUrl?: string;
  selectedLoras?: Array<{ id: string; name: string; strength: number }>;
}

export interface PhaseConfigSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPreset: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onRemovePreset: () => void;
  selectedPresetId: string | null;
  currentPhaseConfig?: PhaseConfig;
  initialTab?: 'browse' | 'add-new';
  intent?: 'load' | 'overwrite';
  availableLoras?: LoraModel[];
  generationTypeMode?: 'i2v' | 'vace';
  currentSettings?: CurrentSettings;
}

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
  currentSettings?: CurrentSettings;
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
