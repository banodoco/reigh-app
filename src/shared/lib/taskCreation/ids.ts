export function generateUUID(): string {
  return crypto.randomUUID();
}

export function generateTaskId(taskTypePrefix: string): string {
  const runId = generateRunId();
  const shortUuid = generateUUID().slice(0, 6);
  return `${taskTypePrefix}_${runId.substring(2, 10)}_${shortUuid}`;
}

export function generateRunId(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, '');
}
