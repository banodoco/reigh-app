import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { ActiveLora } from '@/domains/lora/types/lora';
import type {
  GenerationSource,
  HiresFixConfig,
  PromptEntry,
  ReferenceMode,
  TextToImageModel,
} from '../../types';
import type { GetTaskParams } from './types';
import { buildSubmissionTaskParams } from './submissionTaskPlan';

interface UseTaskParamsBuilderProps {
  selectedProjectId: string | undefined;
  imagesPerPrompt: number;
  associatedShotId: string | null;
  currentBeforePromptText: string;
  currentAfterPromptText: string;
  styleBoostTerms: string;
  isLocalGenerationEnabled: boolean;
  hiresFixConfig: HiresFixConfig;
  projectResolution?: string;
  generationSourceRef: MutableRefObject<GenerationSource>;
  selectedTextModelRef: MutableRefObject<TextToImageModel>;
  selectedLorasRef: MutableRefObject<ActiveLora[]>;
  styleReferenceImageGeneration: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  effectiveSubjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  referenceMode: ReferenceMode;
}

export function useTaskParamsBuilder(props: UseTaskParamsBuilderProps): GetTaskParams {
  const {
    selectedProjectId,
    imagesPerPrompt,
    associatedShotId,
    currentBeforePromptText,
    currentAfterPromptText,
    styleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    projectResolution,
    generationSourceRef,
    selectedTextModelRef,
    selectedLorasRef,
    styleReferenceImageGeneration,
    styleReferenceStrength,
    subjectStrength,
    effectiveSubjectDescription,
    inThisScene,
    inThisSceneStrength,
    referenceMode,
  } = props;

  return useCallback((promptsToUse: PromptEntry[], options?: { imagesPerPromptOverride?: number }) => {
    return buildSubmissionTaskParams({
      selectedProjectId,
      imagesPerPrompt,
      associatedShotId,
      beforePromptText: currentBeforePromptText,
      afterPromptText: currentAfterPromptText,
      styleBoostTerms,
      isLocalGenerationEnabled,
      hiresFixConfig,
      projectResolution,
      generationSource: generationSourceRef.current,
      selectedTextModel: selectedTextModelRef.current,
      selectedLoras: selectedLorasRef.current,
      styleReferenceImageGeneration,
      styleReferenceStrength,
      subjectStrength,
      effectiveSubjectDescription,
      inThisScene,
      inThisSceneStrength,
      referenceMode,
    }, promptsToUse, options);
  // selectedLorasRef is intentionally read via .current inside the callback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    styleReferenceImageGeneration,
    styleReferenceStrength,
    subjectStrength,
    effectiveSubjectDescription,
    inThisScene,
    inThisSceneStrength,
    referenceMode,
    selectedProjectId,
    imagesPerPrompt,
    associatedShotId,
    currentBeforePromptText,
    currentAfterPromptText,
    styleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    generationSourceRef,
    selectedTextModelRef,
  ]);
}
