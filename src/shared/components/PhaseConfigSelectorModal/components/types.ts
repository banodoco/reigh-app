import type { UseQueryResult } from '@tanstack/react-query';
import type {
  PhaseConfigMetadata,
  Resource,
  useCreateResource,
  useDeleteResource,
  useUpdateResource,
} from '@/shared/hooks/useResources';
import type { LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { CurrentSettings, ModelTypeFilter } from '../types';

export interface AddNewTabProps {
  createResource: ReturnType<typeof useCreateResource>;
  updateResource: ReturnType<typeof useUpdateResource>;
  onSwitchToBrowse: () => void;
  currentPhaseConfig?: PhaseConfig;
  editingPreset?: (Resource & { metadata: PhaseConfigMetadata }) | null;
  onClearEdit: () => void;
  isOverwriting?: boolean;
  availableLoras?: LoraModel[];
  generationTypeMode?: 'i2v' | 'vace';
  currentSettings?: CurrentSettings;
  defaultIsPublic: boolean;
}

export interface BrowsePresetsTabProps {
  onSelectPreset: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  onRemovePreset: () => void;
  selectedPresetId: string | null;
  myPresetsResource: UseQueryResult<Resource[], Error>;
  publicPresetsResource: UseQueryResult<Resource[], Error>;
  createResource: ReturnType<typeof useCreateResource>;
  deleteResource: ReturnType<typeof useDeleteResource>;
  onEdit: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  showMyPresetsOnly: boolean;
  showSelectedPresetOnly: boolean;
  onProcessedPresetsLengthChange: (length: number) => void;
  onPageChange?: (page: number, totalPages: number, setPage: (page: number) => void) => void;
  intent?: 'load' | 'overwrite';
  onOverwrite?: (preset: Resource & { metadata: PhaseConfigMetadata }) => void;
  initialModelTypeFilter?: ModelTypeFilter;
}

export interface BrowsePresetItem extends Resource {
  metadata: PhaseConfigMetadata;
  _isMyPreset: boolean;
}

export interface PresetToDeleteState {
  id: string;
  name: string;
  isSelected: boolean;
}
