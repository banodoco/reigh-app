import { useCallback } from 'react';
import type { UseFormSubmissionProps } from './types';
import type { SubmissionOrchestratorCommands } from './useSubmissionOrchestrator';

interface UsePromptQueueHandlersInput {
  commands: Pick<
    SubmissionOrchestratorCommands,
    'generateAndSubmit' | 'queueExisting' | 'queueLikeExisting'
  >;
}

interface PromptQueueHandlers {
  handleGenerateAndQueue: (updatedPrompts: UseFormSubmissionProps['prompts']) => void;
  handleUseExistingPrompts: () => Promise<void>;
  handleNewPromptsLikeExisting: () => Promise<void>;
}

export function usePromptQueueHandlers(input: UsePromptQueueHandlersInput): PromptQueueHandlers {
  const { commands } = input;

  const handleGenerateAndQueue = useCallback((updatedPrompts: UseFormSubmissionProps['prompts']) => {
    commands.generateAndSubmit(updatedPrompts);
  }, [commands]);

  const handleUseExistingPrompts = useCallback(async () => {
    commands.queueExisting();
  }, [commands]);

  const handleNewPromptsLikeExisting = useCallback(async () => {
    commands.queueLikeExisting();
  }, [commands]);

  return {
    handleGenerateAndQueue,
    handleUseExistingPrompts,
    handleNewPromptsLikeExisting,
  };
}
