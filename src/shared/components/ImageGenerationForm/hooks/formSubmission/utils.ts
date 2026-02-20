import type { GeneratedPromptResult, UseFormSubmissionProps } from './types';
import { toShortPrompt } from '../promptManagement/utils';

const MAX_LABEL_LENGTH = 50;

export function truncateLabel(text: string): string {
  if (text.length <= MAX_LABEL_LENGTH) {
    return text;
  }

  return `${text.slice(0, MAX_LABEL_LENGTH)}...`;
}

export function toPromptEntries(results: GeneratedPromptResult[]) {
  return results.map((item) => ({
    id: item.id,
    fullPrompt: item.text,
    shortPrompt: item.shortText || toShortPrompt(item.text),
  }));
}

export function sanitizePrompts(updatedPrompts: UseFormSubmissionProps['prompts']) {
  const seenIds = new Set<string>();

  return updatedPrompts.map((original) => {
    let id = original.id && !seenIds.has(original.id) ? original.id : '';

    if (!id) {
      id = `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    }

    seenIds.add(id);

    return {
      ...original,
      id,
      shortPrompt: original.shortPrompt || toShortPrompt(original.fullPrompt),
    };
  });
}
