import type { ReactNode } from 'react';
import type { ActiveLora, LoraModel } from './lora';

export interface LoraManagerOptions {
  projectId?: string;
  shotId?: string;
  selectedLoras?: ActiveLora[];
  onSelectedLorasChange?: (loras: ActiveLora[]) => void;
  persistenceScope?: 'project' | 'shot' | 'none';
  enableProjectPersistence?: boolean;
  persistenceKey?: string;
  disableAutoLoad?: boolean;
  enableTriggerWords?: boolean;
  onPromptUpdate?: (newPrompt: string) => void;
  currentPrompt?: string;
}

export interface LoraManagerState {
  selectedLoras: ActiveLora[];
  setSelectedLoras: (loras: ActiveLora[]) => void;
  isLoraModalOpen: boolean;
  setIsLoraModalOpen: (open: boolean) => void;
  handleAddLora: (lora: LoraModel, isManualAction?: boolean, initialStrength?: number) => void;
  handleRemoveLora: (loraId: string) => void;
  handleLoraStrengthChange: (loraId: string, strength: number) => void;
  hasEverSetLoras: boolean;
  shouldApplyDefaults: boolean;
  markAsUserSet: () => void;
  handleAddTriggerWord?: (triggerWord: string) => void;
  handleSaveProjectLoras?: () => Promise<void>;
  handleLoadProjectLoras?: () => Promise<void>;
  hasSavedLoras?: boolean;
  isSavingLoras?: boolean;
  saveSuccess?: boolean;
  saveFlash?: boolean;
  renderHeaderActions?: () => ReactNode;
}
