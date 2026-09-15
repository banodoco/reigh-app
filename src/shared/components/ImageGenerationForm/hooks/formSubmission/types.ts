import type { FormEvent, MutableRefObject } from 'react';
import type { ActiveLora } from '@/domains/lora/types/lora';
import type { AIPromptItem, GeneratePromptsParams } from '@/types/ai';
import type { BatchImageGenerationTaskParams } from '@/shared/types/imageGeneration';
import type {
  GenerationSource,
  HiresFixConfig,
  PromptEntry,
  PromptMode,
  ReferenceMode,
  TextToImageModel,
} from '../../types';

export interface FormStateSnapshot {
  masterPromptText: string;
  imagesPerPrompt: number;
  promptMultiplier: number;
  selectedProjectId: string | undefined;
  associatedShotId: string | null;
  styleReferenceImageGeneration: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  effectiveSubjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  referenceMode: ReferenceMode;
  beforePromptText: string;
  afterPromptText: string;
  styleBoostTerms: string;
  isLocalGenerationEnabled: boolean;
  hiresFixConfig: HiresFixConfig;
  projectResolution?: string;
}

export interface FormSubmissionFormState {
  selectedProjectId: string | undefined;
  prompts: PromptEntry[];
  imagesPerPrompt: number;
  promptMultiplier: number;
  associatedShotId: string | null;
  currentBeforePromptText: string;
  currentAfterPromptText: string;
  styleBoostTerms: string;
  isLocalGenerationEnabled: boolean;
  hiresFixConfig: HiresFixConfig;
  projectResolution?: string;
  effectivePromptMode: PromptMode;
  masterPromptText: string;
  actionablePromptsCount: number;
}

export interface FormSubmissionPromptConfig {
  generationSourceRef: MutableRefObject<GenerationSource>;
  selectedTextModelRef: MutableRefObject<TextToImageModel>;
  selectedLoras: ActiveLora[];
  styleReferenceImageGeneration: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  effectiveSubjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  referenceMode: ReferenceMode;
}

export interface FormSubmissionEffects {
  aiGeneratePrompts: (params: GeneratePromptsParams) => Promise<AIPromptItem[]>;
  onGenerate: (params: BatchImageGenerationTaskParams) => Promise<string[] | void> | string[] | void;
  setPrompts: (prompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => void;
  automatedSubmitButton: {
    trigger: () => void;
    isSubmitting: boolean;
    isSuccess: boolean;
  };
}

export interface UseFormSubmissionProps {
  formState: FormSubmissionFormState;
  promptConfig: FormSubmissionPromptConfig;
  effects: FormSubmissionEffects;
}

export interface UseFormSubmissionReturn {
  handleSubmit: (e: FormEvent) => Promise<void>;
  handleGenerateAndQueue: (updatedPrompts: PromptEntry[]) => void;
  handleUseExistingPrompts: () => Promise<void>;
  handleNewPromptsLikeExisting: () => Promise<void>;
}

export type GetTaskParams = (
  promptsToUse: PromptEntry[],
  options?: { imagesPerPromptOverride?: number }
) => BatchImageGenerationTaskParams | null;

export interface GeneratedPromptResult {
  id: string;
  text: string;
  shortText?: string;
}
