import type { Task } from '@/types/tasks';
import { deriveInputImages, parseTaskParams } from '@/shared/lib/taskParamsUtils';

interface NormalizedTaskDetailsPayload {
  parsedParams: Record<string, unknown>;
  orchestratorDetails: Record<string, unknown>;
  orchestratorPayload: Record<string, unknown>;
  inputImages: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function cleanUrl(url: string): string {
  return url.replace(/^["']|["']$/g, '');
}

export function normalizeTaskDetailsPayload(
  task: Task | null | undefined,
): NormalizedTaskDetailsPayload {
  const parsedParams = parseTaskParams(task?.params);
  const orchestratorDetails = asRecord(parsedParams.orchestrator_details) ?? {};
  const orchestratorPayload = asRecord(parsedParams.full_orchestrator_payload) ?? {};
  const inputImages = deriveInputImages(parsedParams).map(cleanUrl);

  return {
    parsedParams,
    orchestratorDetails,
    orchestratorPayload,
    inputImages,
  };
}

export function pickTaskDetailsString(
  normalized: NormalizedTaskDetailsPayload,
  key: string,
): string | undefined {
  return asString(normalized.parsedParams[key])
    ?? asString(normalized.orchestratorDetails[key])
    ?? asString(normalized.orchestratorPayload[key]);
}
