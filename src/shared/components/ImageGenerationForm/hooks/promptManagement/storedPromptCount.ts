export function getStoredPromptCount(effectiveShotId: string): number {
  try {
    if (typeof window !== 'undefined') {
      const shotSpecificKey = `ig:lastPromptCount:${effectiveShotId}`;
      const stored =
        window.sessionStorage.getItem(shotSpecificKey) ||
        window.sessionStorage.getItem('ig:lastPromptCount');

      const parsed = stored ? Number.parseInt(stored, 10) : 1;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    }
  } catch {
    // Ignore sessionStorage errors.
  }

  return 1;
}
