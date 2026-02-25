import type { MutableRefObject } from 'react';
import type { FormStateSnapshot, UseFormSubmissionProps } from './types';

export interface SubmissionRuntimeContext {
  prompts: UseFormSubmissionProps['prompts'];
  promptMultiplier: UseFormSubmissionProps['promptMultiplier'];
  imagesPerPrompt: UseFormSubmissionProps['imagesPerPrompt'];
  actionablePromptsCount: UseFormSubmissionProps['actionablePromptsCount'];
  styleReferenceImageGeneration: UseFormSubmissionProps['styleReferenceImageGeneration'];
  generationSourceRef: UseFormSubmissionProps['generationSourceRef'];
  selectedTextModelRef: UseFormSubmissionProps['selectedTextModelRef'];
  formStateRef: MutableRefObject<FormStateSnapshot | undefined>;
}

export function buildSubmissionRuntimeContext(
  props: Pick<
    UseFormSubmissionProps,
    | 'prompts'
    | 'promptMultiplier'
    | 'imagesPerPrompt'
    | 'actionablePromptsCount'
    | 'styleReferenceImageGeneration'
    | 'generationSourceRef'
    | 'selectedTextModelRef'
  >,
  formStateRef: MutableRefObject<FormStateSnapshot | undefined>,
): SubmissionRuntimeContext {
  return {
    prompts: props.prompts,
    promptMultiplier: props.promptMultiplier,
    imagesPerPrompt: props.imagesPerPrompt,
    actionablePromptsCount: props.actionablePromptsCount,
    styleReferenceImageGeneration: props.styleReferenceImageGeneration,
    generationSourceRef: props.generationSourceRef,
    selectedTextModelRef: props.selectedTextModelRef,
    formStateRef,
  };
}
