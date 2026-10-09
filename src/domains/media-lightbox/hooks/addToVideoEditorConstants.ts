export const ADD_GENERATION_QUERY_PARAM = 'addGenerationId';
// Scoped intent parameters do not change the primary editor's route.
export const ADD_GENERATION_PROJECT_PARAM = 'addGenerationProject';
export const ADD_GENERATION_TIMELINE_PARAM = 'addGenerationTimeline';

export const PENDING_ADDS_STORAGE_KEY = 'reigh:videoEditor:pendingAdds';

export function readPendingAdds(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_ADDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writePendingAdds(ids: string[]): void {
  try {
    if (ids.length === 0) {
      localStorage.removeItem(PENDING_ADDS_STORAGE_KEY);
    } else {
      localStorage.setItem(PENDING_ADDS_STORAGE_KEY, JSON.stringify(ids));
    }
  } catch {
    // storage unavailable (private mode) — best-effort only
  }
}
