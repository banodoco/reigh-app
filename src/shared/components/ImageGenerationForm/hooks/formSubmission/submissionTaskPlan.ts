import { toast } from '@/shared/components/ui/runtime/sonner';
import { buildBatchTaskParams } from '../buildBatchTaskParams';
import { buildReferenceParams } from './referenceParams';
import type { BatchImageGenerationTaskParams } from '@/shared/lib/tasks/imageGeneration';
import type {
  GenerationSource,
  HiresFixConfig,
  PromptEntry,
  ReferenceMode,
  TextToImageModel,
} from '../../types';

export interface SubmissionTaskContext {
  selectedProjectId: string | undefined;
  imagesPerPrompt: number;
  associatedShotId: string | null;
  beforePromptText: string;
  afterPromptText: string;
  styleBoostTerms: string;
  isLocalGenerationEnabled: boolean;
  hiresFixConfig: HiresFixConfig;
  generationSource: GenerationSource;
  selectedTextModel: TextToImageModel;
  styleReferenceImageGeneration: string | null;
  styleReferenceStrength: number;
  subjectStrength: number;
  effectiveSubjectDescription: string;
  inThisScene: boolean;
  inThisSceneStrength: number;
  referenceMode: ReferenceMode;
}

interface BuildSubmissionTaskParamsOptions {
  imagesPerPromptOverride?: number;
}

/**
 * Build canonical batch task params for form submission in both managed and
 * automated prompt modes.
 */
export function buildSubmissionTaskParams(
  context: SubmissionTaskContext,
  promptsToUse: PromptEntry[],
  options?: BuildSubmissionTaskParamsOptions,
): BatchImageGenerationTaskParams | null {
  const activePrompts = promptsToUse.filter((prompt) => prompt.fullPrompt.trim() !== '');
  if (activePrompts.length === 0) {
    toast.error('Please enter at least one valid prompt.');
    return null;
  }

  if (!context.selectedProjectId) {
    toast.error('Please select a project before generating.');
    return null;
  }

  if (context.generationSource === 'by-reference' && !context.styleReferenceImageGeneration) {
    toast.error('Please upload a style reference image for by-reference mode.');
    return null;
  }

  const referenceParams = buildReferenceParams(context.generationSource, {
    styleReferenceImageGeneration: context.styleReferenceImageGeneration,
    styleReferenceStrength: context.styleReferenceStrength,
    subjectStrength: context.subjectStrength,
    effectiveSubjectDescription: context.effectiveSubjectDescription,
    inThisScene: context.inThisScene,
    inThisSceneStrength: context.inThisSceneStrength,
    referenceMode: context.referenceMode,
  });

  const effectiveStyleBoostTerms =
    context.generationSource === 'by-reference' && context.referenceMode === 'style'
      ? context.styleBoostTerms
      : '';

  return buildBatchTaskParams({
    projectId: context.selectedProjectId,
    prompts: activePrompts,
    imagesPerPrompt: options?.imagesPerPromptOverride ?? context.imagesPerPrompt,
    shotId: context.associatedShotId,
    beforePromptText: context.beforePromptText,
    afterPromptText: context.afterPromptText,
    styleBoostTerms: effectiveStyleBoostTerms,
    isLocalGenerationEnabled: context.isLocalGenerationEnabled,
    hiresFixConfig: context.hiresFixConfig,
    modelName: context.generationSource === 'just-text'
      ? context.selectedTextModel
      : 'qwen-image',
    referenceParams,
  });
}
