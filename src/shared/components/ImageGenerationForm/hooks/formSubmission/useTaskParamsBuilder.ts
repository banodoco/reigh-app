import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import { buildBatchTaskParams } from '../buildBatchTaskParams';
import type {
  GenerationSource,
  HiresFixConfig,
  PromptEntry,
  ReferenceMode,
  TextToImageModel,
} from '../../types';
import { buildReferenceParams } from './referenceParams';
import type { GetTaskParams } from './types';

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
    const activePrompts = promptsToUse.filter((prompt) => prompt.fullPrompt.trim() !== '');
    if (activePrompts.length === 0) {
      toast.error('Please enter at least one valid prompt.');
      return null;
    }

    const currentGenerationSource = generationSourceRef.current;
    const currentTextModel = selectedTextModelRef.current;

    if (currentGenerationSource === 'by-reference' && !styleReferenceImageGeneration) {
      toast.error('Please upload a style reference image for by-reference mode.');
      return null;
    }

    const referenceParams = buildReferenceParams(currentGenerationSource, {
      styleReferenceImageGeneration,
      styleReferenceStrength,
      subjectStrength,
      effectiveSubjectDescription,
      inThisScene,
      inThisSceneStrength,
      referenceMode,
    });

    // Only apply styleBoostTerms when in by-reference mode with style reference mode active.
    // The "Style-boost terms" field is only shown in that combination; applying it in other
    // modes would silently append stale terms from a previously-selected reference.
    const effectiveStyleBoostTerms =
      currentGenerationSource === 'by-reference' && referenceMode === 'style'
        ? styleBoostTerms
        : '';

    return buildBatchTaskParams({
      projectId: selectedProjectId!,
      prompts: activePrompts,
      imagesPerPrompt: options?.imagesPerPromptOverride ?? imagesPerPrompt,
      shotId: associatedShotId,
      beforePromptText: currentBeforePromptText,
      afterPromptText: currentAfterPromptText,
      styleBoostTerms: effectiveStyleBoostTerms,
      isLocalGenerationEnabled,
      hiresFixConfig,
      modelName: currentGenerationSource === 'just-text' ? currentTextModel : 'qwen-image',
      referenceParams,
    });
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
