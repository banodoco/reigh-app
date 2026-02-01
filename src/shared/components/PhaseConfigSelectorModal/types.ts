import { Resource, PhaseConfigMetadata } from '@/shared/hooks/useResources';
import { PhaseConfig } from '@/tools/travel-between-images/settings';
import { LoraModel } from '@/shared/components/LoraSelectorModal';

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

export interface PresetFormState {
  name: string;
  description: string;
  created_by_is_you: boolean;
  created_by_username: string;
  is_public: boolean;
  basePrompt: string;
  negativePrompt: string;
  textBeforePrompts: string;
  textAfterPrompts: string;
  enhancePrompt: boolean;
  durationFrames: number;
}

export interface BrowsePresetsTabProps {
  presets: (Resource & { metadata: PhaseConfigMetadata })[];
  publicPresets: (Resource & { metadata: PhaseConfigMetadata })[];
  myPresetsLoading: boolean;
  publicPresetsLoading: boolean;
  selectedPresetId: string | null;
  intent: 'load' | 'overwrite';
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  sortOption: SortOption;
  setSortOption: (option: SortOption) => void;
  modelTypeFilter: ModelTypeFilter;
  setModelTypeFilter: (filter: ModelTypeFilter) => void;
  showMyPresetsOnly: boolean;
  setShowMyPresetsOnly: (show: boolean) => void;
  showSelectedPresetOnly: boolean;
  setShowSelectedPresetOnly: (show: boolean) => void;
  onSelectPreset: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onRemovePreset: () => void;
  onOverwrite?: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onEdit: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onDelete: (preset: { id: string; name: string; isSelected: boolean }) => void;
  availableLoras?: LoraModel[];
  userId?: string;
  createResource: any;
  setPage: (page: number) => void;
  page: number;
}

export interface AddNewPresetTabProps {
  isEditMode: boolean;
  isOverwriting: boolean;
  editingPreset: (Resource & { metadata: PhaseConfigMetadata }) | null;
  currentPhaseConfig?: PhaseConfig;
  currentSettings?: CurrentSettings;
  availableLoras?: LoraModel[];
  initialGenerationTypeMode: 'i2v' | 'vace';
  defaultIsPublic: boolean;
  onClearEdit: () => void;
  onSwitchToBrowse: () => void;
  createResource: any;
  updateResource: any;
}
