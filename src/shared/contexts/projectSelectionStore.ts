/**
 * Runtime project selection snapshot for non-React consumers.
 *
 * This replaces ad-hoc window globals with an explicit typed access layer.
 */
const PROJECT_SELECTION_STORAGE_KEY = 'lastSelectedProjectId';

export interface ProjectSelectionSnapshot {
  selectedProjectId: string | null;
}

type ProjectSelectionListener = (snapshot: ProjectSelectionSnapshot) => void;

function readPersistedProjectSelection(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const persisted = window.localStorage.getItem(PROJECT_SELECTION_STORAGE_KEY);
    return persisted && persisted.trim().length > 0 ? persisted : null;
  } catch {
    return null;
  }
}

let snapshot: ProjectSelectionSnapshot = {
  selectedProjectId: readPersistedProjectSelection(),
};

const listeners = new Set<ProjectSelectionListener>();

export function setProjectSelectionSnapshot(next: ProjectSelectionSnapshot): void {
  const normalized: ProjectSelectionSnapshot = {
    selectedProjectId: next.selectedProjectId ?? null,
  };
  if (snapshot.selectedProjectId === normalized.selectedProjectId) {
    return;
  }
  snapshot = normalized;
  for (const listener of listeners) {
    listener(snapshot);
  }
}

export function getProjectSelectionSnapshot(): ProjectSelectionSnapshot {
  return snapshot;
}

export function getProjectSelectionFallbackId(): string | null {
  return snapshot.selectedProjectId ?? readPersistedProjectSelection();
}

export function subscribeProjectSelection(listener: ProjectSelectionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
