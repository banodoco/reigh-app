import { nanoid } from 'nanoid';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fall through to nanoid when runtime crypto UUID generation is unavailable.
    }
  }

  return nanoid();
}

export function generateTaskId(taskTypePrefix: string): string {
  const runId = generateRunId();
  const shortUuid = generateUUID().slice(0, 6);
  return `${taskTypePrefix}_${runId.substring(2, 10)}_${shortUuid}`;
}

export function generateRunId(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, '');
}
