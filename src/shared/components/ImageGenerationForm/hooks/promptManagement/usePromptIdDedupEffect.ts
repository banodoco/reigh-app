import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import type { PromptEntry } from '../../types';
import type { PromptRoutingResult } from './types';

interface PromptIdDedupInput {
  prompts: PromptEntry[];
  setPrompts: PromptRoutingResult['setPrompts'];
  promptIdCounter: MutableRefObject<number>;
}

export function usePromptIdDedupEffect(input: PromptIdDedupInput): void {
  const { prompts, setPrompts, promptIdCounter } = input;

  useEffect(() => {
    let nextId = prompts.reduce((max, prompt) => {
      const match = /^prompt-(\d+)$/.exec(prompt.id || '');
      if (!match) {
        return max;
      }

      const numericId = parseInt(match[1], 10) + 1;
      return numericId > max ? numericId : max;
    }, 1);

    const seenIds = new Set<string>();
    let hadDuplicates = false;

    const dedupedPrompts = prompts.map((prompt) => {
      if (!seenIds.has(prompt.id)) {
        seenIds.add(prompt.id);
        return prompt;
      }

      hadDuplicates = true;
      const newId = `prompt-${nextId++}`;
      seenIds.add(newId);
      return { ...prompt, id: newId };
    });

    if (hadDuplicates) {
      setPrompts(dedupedPrompts);
    }

    if (nextId > promptIdCounter.current) {
      promptIdCounter.current = nextId;
    }
  }, [prompts, setPrompts, promptIdCounter]);
}
