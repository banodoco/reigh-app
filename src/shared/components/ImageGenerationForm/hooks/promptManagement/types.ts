import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { ImageGenShotSettings, PromptEntry, PromptMode } from '../../types';

export interface ShotPromptSettingsContract {
  entityId: string | null;
  status: string;
  settings: ImageGenShotSettings;
  updateField: <T>(field: string, value: T) => void;
}

export interface PromptManagementInput {
  associatedShotId: string | null;
  effectiveShotId: string;
  shotPromptSettings: ShotPromptSettingsContract;
  noShotPrompts: PromptEntry[];
  setNoShotPrompts: Dispatch<SetStateAction<PromptEntry[]>>;
  noShotMasterPrompt: string;
  setNoShotMasterPrompt: Dispatch<SetStateAction<string>>;
  promptMode: PromptMode;
  setPromptMode: Dispatch<SetStateAction<PromptMode>>;
  beforeEachPromptText: string;
  setBeforeEachPromptText: Dispatch<SetStateAction<string>>;
  afterEachPromptText: string;
  setAfterEachPromptText: Dispatch<SetStateAction<string>>;
  ready: boolean;
  markAsInteracted: () => void;
  generatePromptId: () => string;
  promptIdCounter: MutableRefObject<number>;
}

export interface PromptManagementOutput {
  prompts: PromptEntry[];
  masterPromptText: string;
  effectivePromptMode: PromptMode;
  currentBeforePromptText: string;
  currentAfterPromptText: string;
  isShotSettingsReady: boolean;
  actionablePromptsCount: number;
  lastKnownPromptCount: number;
  setPrompts: (newPrompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => void;
  setMasterPromptText: Dispatch<SetStateAction<string>>;
  setEffectivePromptMode: (mode: PromptMode) => void;
  setCurrentBeforePromptText: (text: string) => void;
  setCurrentAfterPromptText: (text: string) => void;
  handleAddPrompt: (source?: 'form' | 'modal') => void;
  handleUpdatePrompt: (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => void;
  handleRemovePrompt: (id: string) => void;
  handleDeleteAllPrompts: () => void;
  handleSavePromptsFromModal: (updatedPrompts: PromptEntry[]) => void;
}

export interface PromptRoutingResult {
  prompts: PromptEntry[];
  setPrompts: (newPrompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => void;
  masterPromptText: string;
  setMasterPromptText: Dispatch<SetStateAction<string>>;
  effectivePromptMode: PromptMode;
  setEffectivePromptMode: (mode: PromptMode) => void;
  currentBeforePromptText: string;
  setCurrentBeforePromptText: (text: string) => void;
  currentAfterPromptText: string;
  setCurrentAfterPromptText: (text: string) => void;
}
