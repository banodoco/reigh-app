import { Resource, PhaseConfigMetadata } from '@/shared/hooks/useResources';
import { PhaseConfig } from '@/shared/types/phaseConfig';
import { LoraModel } from '@/domains/lora/components/LoraSelectorModal';

export type SortOption = 'default' | 'newest' | 'oldest' | 'mostUsed' | 'name';

export type ModelTypeFilter = 'all' | 'i2v' | 'vace';

interface CurrentSettings {
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

// Note: BrowsePresetsTabProps and AddNewTabProps are defined in their respective
// component files (components/BrowsePresetsTab.tsx and components/AddNewPresetTab.tsx)
// to keep types close to implementation.
