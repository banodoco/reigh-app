export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function generateRunId(): string {
  return new Date().toISOString().replace(/[-:.TZ]/g, "");
}

export function generateTaskId(taskTypePrefix: string): string {
  const runId = generateRunId();
  const shortUuid = generateUUID().slice(0, 6);
  return `${taskTypePrefix}_${runId.substring(2, 10)}_${shortUuid}`;
}
