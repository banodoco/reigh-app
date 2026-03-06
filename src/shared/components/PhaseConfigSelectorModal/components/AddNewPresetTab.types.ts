import type {
  PhaseConfigMetadata,
  Resource,
  useCreateResource,
  useUpdateResource,
} from '@/shared/hooks/useResources';
import type { LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import type { PhaseConfig } from '@/shared/types/phaseConfig';

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
  defaultIsPublic: boolean;
}
