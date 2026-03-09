/**
 * Runtime project selection snapshot for non-React consumers.
 *
 * This replaces ad-hoc window globals with an explicit typed access layer.
 */
const PROJECT_SELECTION_STORAGE_KEY = 'lastSelectedProjectId';

interface ProjectSelectionSnapshot {
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

function normalizeSelectedProjectId(selectedProjectId: string | null | undefined): string | null {
  return selectedProjectId && selectedProjectId.trim().length > 0 ? selectedProjectId : null;
}

let snapshot: ProjectSelectionSnapshot = { selectedProjectId: null };
let initialized = false;
const listeners = new Set<ProjectSelectionListener>();

export function initializeProjectSelectionStore(
  initialSelectedProjectId: string | null = readPersistedProjectSelection(),
): ProjectSelectionSnapshot {
  const normalized: ProjectSelectionSnapshot = {
    selectedProjectId: normalizeSelectedProjectId(initialSelectedProjectId),
  };
  const shouldNotify = initialized && snapshot.selectedProjectId !== normalized.selectedProjectId;
  snapshot = normalized;
  initialized = true;

  if (shouldNotify) {
    for (const listener of listeners) {
      listener(normalized);
    }
  }

  return getProjectSelectionSnapshot();
}

export function setProjectSelectionSnapshot(next: ProjectSelectionSnapshot): void {
  initializeProjectSelectionStore(next.selectedProjectId ?? null);
}

export function getProjectSelectionSnapshot(): ProjectSelectionSnapshot {
  return { ...snapshot };
}

export function getProjectSelectionFallbackId(): string | null {
  return snapshot.selectedProjectId;
}

/** @internal Only for test isolation — do not call in production code. */
export function resetProjectSelectionStoreForTests(): void {
  snapshot = { selectedProjectId: null };
  initialized = false;
  listeners.clear();
}
