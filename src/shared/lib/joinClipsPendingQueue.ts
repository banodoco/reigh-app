const LEGACY_PENDING_JOIN_CLIPS_KEY = 'pendingJoinClips';
const PENDING_JOIN_CLIPS_KEY_PREFIX = 'pendingJoinClips';
const ANONYMOUS_SCOPE = 'anonymous';

export interface PendingJoinClipEntry {
  videoUrl: string;
  thumbnailUrl?: string;
  generationId: string;
  timestamp: number;
  projectId?: string;
  userId?: string;
}

interface PendingJoinClipScope {
  projectId?: string | null;
  userId?: string | null;
}

function normalizeScopePart(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getPendingJoinClipsStorageKey(
  projectId: string | null | undefined,
  userId?: string | null,
): string {
  const normalizedProjectId = normalizeScopePart(projectId);
  if (!normalizedProjectId) {
    return LEGACY_PENDING_JOIN_CLIPS_KEY;
  }
  const normalizedUserId = normalizeScopePart(userId) ?? ANONYMOUS_SCOPE;
  return `${PENDING_JOIN_CLIPS_KEY_PREFIX}:${normalizedProjectId}:${normalizedUserId}`;
}

export function getPendingJoinClipsCandidateKeys(
  scope: PendingJoinClipScope,
): string[] {
  const scopedKey = getPendingJoinClipsStorageKey(scope.projectId, scope.userId);
  return scopedKey === LEGACY_PENDING_JOIN_CLIPS_KEY
    ? [LEGACY_PENDING_JOIN_CLIPS_KEY]
    : [scopedKey, LEGACY_PENDING_JOIN_CLIPS_KEY];
}

export function isPendingJoinClipInScope(
  entry: PendingJoinClipEntry,
  scope: PendingJoinClipScope,
): boolean {
  const normalizedProjectId = normalizeScopePart(scope.projectId);
  if (normalizedProjectId) {
    const entryProjectId = normalizeScopePart(entry.projectId);
    if (entryProjectId && entryProjectId !== normalizedProjectId) {
      return false;
    }
  }

  const normalizedUserId = normalizeScopePart(scope.userId);
  if (normalizedUserId) {
    const entryUserId = normalizeScopePart(entry.userId);
    if (entryUserId && entryUserId !== normalizedUserId) {
      return false;
    }
  }

  return true;
}
