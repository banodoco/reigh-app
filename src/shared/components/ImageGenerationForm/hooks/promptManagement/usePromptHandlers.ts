import { useCallback } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import type { PromptEntry } from '../../types';
import type { PromptRoutingResult } from './types';
import { toShortPrompt } from './utils';

interface PromptHandlersInput {
  prompts: PromptEntry[];
  setPrompts: PromptRoutingResult['setPrompts'];
  markAsInteracted: () => void;
  generatePromptId: () => string;
}

export function usePromptHandlers(input: PromptHandlersInput) {
  const { prompts, setPrompts, markAsInteracted, generatePromptId } = input;

  const handleAddPrompt = useCallback(() => {
    markAsInteracted();
    const newPrompt = {
      id: generatePromptId(),
      fullPrompt: '',
      shortPrompt: `Prompt ${prompts.length + 1}`,
    };

    setPrompts((prev) => [...prev, newPrompt]);
  }, [markAsInteracted, generatePromptId, prompts.length, setPrompts]);

  const handleUpdatePrompt = useCallback(
    (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => {
      markAsInteracted();

      setPrompts((prev) =>
        prev.map((prompt) => {
          if (prompt.id !== id) {
            return prompt;
          }

          const updatedPrompt = { ...prompt, [field]: value };
          if (
            field === 'fullPrompt' &&
            (updatedPrompt.shortPrompt === '' ||
              updatedPrompt.shortPrompt?.startsWith(prompt.fullPrompt.substring(0, 20)))
          ) {
            updatedPrompt.shortPrompt = toShortPrompt(value);
          }

          return updatedPrompt;
        })
      );
    },
    [markAsInteracted, setPrompts]
  );

  const handleRemovePrompt = useCallback(
    (id: string) => {
      markAsInteracted();

      if (prompts.length <= 1) {
        toast.error('Cannot remove the last prompt.');
        return;
      }

      setPrompts((prev) => prev.filter((prompt) => prompt.id !== id));
    },
    [markAsInteracted, prompts.length, setPrompts]
  );

  const handleDeleteAllPrompts = useCallback(() => {
    markAsInteracted();
    setPrompts([{ id: generatePromptId(), fullPrompt: '', shortPrompt: 'Prompt 1' }]);
  }, [markAsInteracted, generatePromptId, setPrompts]);

  const handleSavePromptsFromModal = useCallback(
    (updatedPrompts: PromptEntry[]) => {
      markAsInteracted();

      const seenIds = new Set<string>();
      const sanitizedPrompts = updatedPrompts.map((prompt) => {
        let id = prompt.id && !seenIds.has(prompt.id) ? prompt.id : '';
        if (!id) {
          id = generatePromptId();
        }

        seenIds.add(id);

        return {
          ...prompt,
          id,
          shortPrompt: prompt.shortPrompt || toShortPrompt(prompt.fullPrompt),
        };
      });

      setPrompts(sanitizedPrompts);
    },
    [markAsInteracted, generatePromptId, setPrompts]
  );

  return {
    handleAddPrompt,
    handleUpdatePrompt,
    handleRemovePrompt,
    handleDeleteAllPrompts,
    handleSavePromptsFromModal,
  };
}
