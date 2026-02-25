import { useCallback } from 'react';
import type { FormEvent } from 'react';
import type { UseFormSubmissionProps } from './types';
import type { SubmissionOrchestratorCommands } from './useSubmissionOrchestrator';

interface UseSubmitHandlerInput {
  effectivePromptMode: UseFormSubmissionProps['effectivePromptMode'];
  commands: Pick<SubmissionOrchestratorCommands, 'submitAutomated' | 'submitManaged'>;
}

export function useSubmitHandler(input: UseSubmitHandlerInput): (event: FormEvent) => Promise<void> {
  const { effectivePromptMode, commands } = input;

  return useCallback(async (event: FormEvent) => {
    event.preventDefault();

    if (effectivePromptMode === 'automated') {
      commands.submitAutomated();
      return;
    }

    commands.submitManaged();
  }, [commands, effectivePromptMode]);
}
