import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
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
  generationSourceRef: MutableRefObject<GenerationSource>;
  selectedTextModelRef: MutableRefObject<TextToImageModel>;
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
    generationSourceRef,
    selectedTextModelRef,
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
      generationSource: generationSourceRef.current,
      selectedTextModel: selectedTextModelRef.current,
      styleReferenceImageGeneration,
      styleReferenceStrength,
      subjectStrength,
      effectiveSubjectDescription,
      inThisScene,
      inThisSceneStrength,
      referenceMode,
    }, promptsToUse, options);
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
