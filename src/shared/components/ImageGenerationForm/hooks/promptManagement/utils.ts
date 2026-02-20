export function toShortPrompt(fullPrompt: string): string {
  return `${fullPrompt.substring(0, 30)}${fullPrompt.length > 30 ? '...' : ''}`;
}

export function getStoredPromptCount(effectiveShotId: string): number {
  try {
    if (typeof window !== 'undefined') {
      const shotSpecificKey = `ig:lastPromptCount:${effectiveShotId}`;
      const stored =
        window.sessionStorage.getItem(shotSpecificKey) ||
        window.sessionStorage.getItem('ig:lastPromptCount');

      return stored ? parseInt(stored, 10) : 1;
    }
  } catch {
    // Ignore sessionStorage errors.
  }

  return 1;
}
