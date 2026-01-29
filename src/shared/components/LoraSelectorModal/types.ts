import { UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { Resource } from '@/shared/hooks/useResources';

// Model filter categories - broad matching
export type ModelFilterCategory = 'all' | 'qwen' | 'wan' | 'z-image';

export type SortOption = 'default' | 'downloads' | 'likes' | 'lastModified' | 'name';

export interface LoraModelImage {
  alt_text: string;
  url: string;
  type?: string;
  source?: string;
}

export interface LoraModelFile {
  path: string;
  url: string;
  size?: number;
  last_modified?: string;
}

export interface LoraModel {
  "Model ID": string;
  Name: string;
  Author: string;
  Images: LoraModelImage[];
  "Model Files": LoraModelFile[];
  Description?: string;
  Tags?: string[];
  "Last Modified"?: string;
  Downloads?: number;
  Likes?: number;
  lora_type?: string;
  // New fields
  created_by?: {
    is_you: boolean;
    username?: string;
  };
  huggingface_url?: string;
  filename?: string;
  base_model?: string;
  sample_generations?: {
    url: string;
    type: 'image' | 'video';
    alt_text?: string;
  }[];
  main_generation?: string; // URL to the main generation
  is_public?: boolean;
  trigger_word?: string; // New field for trigger word
  // Multi-stage LoRA support (for Wan 2.2 I2V)
  high_noise_url?: string; // URL for high-noise phases
  low_noise_url?: string;  // URL for low-noise (final) phase
  // Internal fields
  _resourceId?: string;
  [key: string]: unknown;
}

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
  lora_type: string;
}

export interface CommunityLorasTabProps {
  loras: LoraModel[];
  onAddLora: (lora: LoraModel) => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
  selectedLoras: (LoraModel & { strength: number })[];
  myLorasResource: UseQueryResult<Resource[], Error>;
  createResource: UseMutationResult<Resource, Error, { type: 'lora'; metadata: LoraModel; }, unknown>;
  updateResource: UseMutationResult<Resource, Error, { id: string; type: 'lora'; metadata: LoraModel; }, unknown>;
  deleteResource: UseMutationResult<void, Error, { id: string; type: "lora"; }, unknown>;
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
  deleteResource: UseMutationResult<void, Error, { id: string; type: "lora"; }, unknown>;
  createResource: UseMutationResult<Resource, Error, { type: 'lora'; metadata: LoraModel; }, unknown>;
  updateResource: UseMutationResult<Resource, Error, { id: string; type: 'lora'; metadata: LoraModel; }, unknown>;
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

export interface DescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
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
