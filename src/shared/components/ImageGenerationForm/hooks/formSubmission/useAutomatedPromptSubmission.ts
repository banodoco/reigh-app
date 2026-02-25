import { useCallback } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import type { UseFormSubmissionProps } from './types';
import type { RunIncomingTask } from './useIncomingTaskRunner';
import { toPromptEntries, truncateLabel } from './promptSubmissionTransforms';
import { buildSubmissionTaskParams } from './submissionTaskPlan';
import type { SubmissionRuntimeContext } from './submissionContext';

interface UseAutomatedPromptSubmissionInput {
  context: SubmissionRuntimeContext;
  aiGeneratePrompts: UseFormSubmissionProps['aiGeneratePrompts'];
  onGenerate: UseFormSubmissionProps['onGenerate'];
  setPrompts: UseFormSubmissionProps['setPrompts'];
  queueIncomingTask: (options: Parameters<RunIncomingTask>[0]) => void;
}

function hasStyleReferenceError(
  generationSource: UseFormSubmissionProps['generationSourceRef']['current'],
  styleReferenceImageGeneration: string | null,
): boolean {
  return generationSource === 'by-reference' && !styleReferenceImageGeneration;
}

export function useAutomatedPromptSubmission(
  input: UseAutomatedPromptSubmissionInput,
): () => void {
  const { context, aiGeneratePrompts, onGenerate, setPrompts, queueIncomingTask } = input;
  const {
    generationSourceRef,
    selectedTextModelRef,
    formStateRef,
  } = context;

  return useCallback(() => {
    const state = formStateRef.current;
    if (!state) {
      return;
    }

    const currentGenerationSource = generationSourceRef.current;
    const currentTextModel = selectedTextModelRef.current;

    if (!state.masterPromptText.trim()) {
      toast.error('Please enter a master prompt.');
      return;
    }

    if (hasStyleReferenceError(currentGenerationSource, state.styleReferenceImageGeneration)) {
      toast.error('Please upload a style reference image for by-reference mode.');
      return;
    }

    queueIncomingTask({
      label: truncateLabel(state.masterPromptText),
      expectedCount: state.imagesPerPrompt * state.promptMultiplier,
      context: 'useFormSubmission.submitAutomated',
      toastTitle: 'Failed to generate prompts. Please try again.',
      execute: async () => {
        const rawResults = await aiGeneratePrompts({
          overallPromptText: state.masterPromptText,
          numberToGenerate: state.imagesPerPrompt,
          includeExistingContext: false,
          addSummaryForNewPrompts: true,
          replaceCurrentPrompts: true,
          temperature: 0.8,
          rulesToRememberText: '',
        });

        const newPrompts = toPromptEntries(rawResults);
        setPrompts(newPrompts);

        const taskParams = buildSubmissionTaskParams({
          selectedProjectId: state.selectedProjectId,
          imagesPerPrompt: state.imagesPerPrompt,
          associatedShotId: state.associatedShotId,
          beforePromptText: state.beforePromptText,
          afterPromptText: state.afterPromptText,
          styleBoostTerms: state.styleBoostTerms,
          isLocalGenerationEnabled: state.isLocalGenerationEnabled,
          hiresFixConfig: state.hiresFixConfig,
          generationSource: currentGenerationSource,
          selectedTextModel: currentTextModel,
          styleReferenceImageGeneration: state.styleReferenceImageGeneration,
          styleReferenceStrength: state.styleReferenceStrength,
          subjectStrength: state.subjectStrength,
          effectiveSubjectDescription: state.effectiveSubjectDescription,
          inThisScene: state.inThisScene,
          inThisSceneStrength: state.inThisSceneStrength,
          referenceMode: state.referenceMode,
        }, newPrompts, { imagesPerPromptOverride: state.promptMultiplier });
        if (!taskParams) {
          return undefined;
        }

        const result = await onGenerate(taskParams);
        return result || undefined;
      },
    });
  }, [
    aiGeneratePrompts,
    formStateRef,
    generationSourceRef,
    onGenerate,
    queueIncomingTask,
    selectedTextModelRef,
    setPrompts,
  ]);
}
