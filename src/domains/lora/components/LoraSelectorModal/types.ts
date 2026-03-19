import { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { Resource, ResourceType, CreateResourceArgs, UpdateResourceArgs } from '@/features/resources/hooks/useResources';
import type { LoraModel as SharedLoraModel } from '@/domains/lora/types/lora';
import type { OpenStateContract } from '@/shared/components/dialogs/contracts';

// Model filter categories - broad matching
export type ModelFilterCategory = 'all' | 'qwen' | 'wan' | 'ltx' | 'z-image';

export type SortOption = 'default' | 'downloads' | 'likes' | 'lastModified' | 'name';

export type LoraModel = SharedLoraModel;

export interface LoraSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  loras: LoraModel[];
  onAddLora: (lora: LoraModel) => void;
  /** Callback to remove a LoRA from the generator */
  onRemoveLora: (loraId: string) => void;
  /** Callback to update a LoRA's strength */
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
  selectedLoras: (LoraModel & { strength: number })[];
  loraType: string;
}

export interface CommunityLorasTabProps {
  loras: LoraModel[];
  onAddLora: (lora: LoraModel) => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
  selectedLoras: (LoraModel & { strength: number })[];
  myLorasResource: UseQueryResult<Resource[], Error>;
  createResource: UseMutationResult<Resource, Error, CreateResourceArgs, unknown>;
  updateResource: UseMutationResult<Resource, Error, UpdateResourceArgs, unknown>;
  deleteResource: UseMutationResult<void, Error, { id: string; type: ResourceType }, unknown>;
  onEdit: (lora: Resource & { metadata: LoraModel }) => void;
  onPageChange?: (page: number, totalPages: number, setPage: (page: number) => void) => void;
  onClose: () => void;
  showMyLorasOnly: boolean;
  setShowMyLorasOnly: (value: boolean) => void;
  showAddedLorasOnly: boolean;
  setShowAddedLorasOnly: (value: boolean) => void;
  onProcessedLorasLengthChange: (length: number) => void;
  selectedModelFilter: ModelFilterCategory;
  setSelectedModelFilter: (value: ModelFilterCategory) => void;
  selectedSubFilter: string;
  setSelectedSubFilter: (value: string) => void;
}

export interface MyLorasTabProps {
  myLorasResource: UseQueryResult<Resource[], Error>;
  deleteResource: UseMutationResult<void, Error, { id: string; type: ResourceType }, unknown>;
  createResource: UseMutationResult<Resource, Error, CreateResourceArgs, unknown>;
  updateResource: UseMutationResult<Resource, Error, UpdateResourceArgs, unknown>;
  /** Callback to switch to the browse tab */
  onSwitchToBrowse: () => void;
  /** LoRA being edited (if any) */
  editingLora?: (Resource & { metadata: LoraModel }) | null;
  /** Callback to clear edit state */
  onClearEdit: () => void;
  /** Default is_public value from user privacy settings */
  defaultIsPublic: boolean;
}

export interface LoraCardProps {
  lora: LoraModel;
  isSelectedOnGenerator: boolean;
  strength?: number;
  isMyLora: boolean;
  isInSavedLoras: boolean;
  isLocalLora: boolean;
  resourceId?: string;
  onAddLora: (lora: LoraModel) => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
  onSave: (lora: LoraModel) => void;
  onEdit: (lora: Resource & { metadata: LoraModel }) => void;
  onDelete: (id: string, name: string, isAdded: boolean) => void;
  onShowFullDescription: (title: string, description: string) => void;
  isSaving: boolean;
  isDeleting: boolean;
}

export interface DescriptionModalProps extends OpenStateContract {
  title: string;
  description: string;
}

export interface LoraFormState {
  name: string;
  description: string;
  created_by_is_you: boolean;
  created_by_username: string;
  huggingface_url: string;
  base_model: string;
  is_public: boolean;
  trigger_word: string;
  high_noise_url: string;
  low_noise_url: string;
}
