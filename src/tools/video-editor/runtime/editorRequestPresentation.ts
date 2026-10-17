import { isValidAstridElementOperation } from './element-contract';
import type { ConversationToolCallPair } from '@/shared/components/conversation/contracts';

export type RecordedEditorResult = { key: string; ok: boolean; details: string };
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function scopeKey(value: unknown): string | null {
  const scope = record(value);
  if (!scope || !['sessionId', 'turnId', 'projectId', 'timelineId'].every(key => typeof scope[key] === 'string' && scope[key])
    || !Number.isSafeInteger(scope.capturedTimelineVersion) || Number(scope.capturedTimelineVersion) < 0) return null;
  return JSON.stringify([scope.sessionId, scope.turnId, scope.projectId, scope.timelineId, scope.capturedTimelineVersion]);
}
/** Presentation evidence only. Never executes a request from saved history. */
export function recordedEditorResults(messages: Iterable<string>, projectId: string, sessionId: string): RecordedEditorResult[] {
  const results: RecordedEditorResult[] = [];
  for (const content of messages) {
    if (content.length > 2_000_000) continue;
    const match = /^\s*<astrid_live_scene_result>([\s\S]*)<\/astrid_live_scene_result>\s*$/.exec(content);
    if (!match) continue;
    try {
      const feedback = JSON.parse(match[1]);
      const scope = record(feedback.scope);
      const key = scopeKey(scope);
      if (feedback.schema !== 'astrid.live-scene-result/v1' || !key || scope?.projectId !== projectId || scope.sessionId !== sessionId || !Array.isArray(feedback.results)) continue;
      for (const result of feedback.results) {
        if (typeof result?.requestId !== 'string' || typeof result.ok !== 'boolean') continue;
        results.push({ key: JSON.stringify([key, result.requestId]), ok: result.ok, details: JSON.stringify(result, null, 2) });
      }
    } catch { /* Malformed feedback cannot establish a recorded result. */ }
  }
  return results;
}
export function presentEditorRequests(content: string, timestamp: string, results: readonly RecordedEditorResult[] = []): { prose: string; pairs: ConversationToolCallPair[] } {
  const pairs: ConversationToolCallPair[] = [];
  let prose = content.replace(/<astrid_live_scene_request>([\s\S]*?)<\/astrid_live_scene_request>/g, (whole, payload: string) => {
    if (payload.length > 32768) return whole;
    try {
      const request = JSON.parse(payload);
      const scope = scopeKey(request.scope);
      if (request.schema !== 'astrid.live-scene-request/v1' || typeof request.requestId !== 'string' || !request.requestId || !scope || !['read', 'publish'].includes(request.action)) return whole;
      const key = JSON.stringify([scope, request.requestId]);
      const matched = results.filter(result => result.key === key);
      const unique = new Map(matched.map(result => [result.details, result]));
      const result = unique.size === 1 ? [...unique.values()][0] : undefined;
      pairs.push({ call: { role: 'tool_call', content: '', tool_name: 'Editor request', tool_call_id: request.requestId, tool_args: request, timestamp },
        result: { role: 'tool_result', timestamp, tool_status: result ? (result.ok ? 'completed' : 'failed') : 'unconfirmed',
          content: result ? `Recorded host result:\n${result.details}` : 'Execution is unconfirmed: no matching recorded host result is available. This saved request has not been executed by opening it.' } });
      return '';
    } catch { return whole; }
  }).trim();
  prose = prose.replace(/<astrid_element_operation>([\s\S]*?)<\/astrid_element_operation>/g, (whole, payload: string) => {
    if (payload.length > 256_000) return whole;
    try {
      const operation: unknown = JSON.parse(payload);
      if (!isValidAstridElementOperation(operation)) return whole;
      pairs.push({ call: { role: 'tool_call', content: '', tool_name: `Editor request · ${operation.name}`, tool_args: operation, timestamp },
        result: { role: 'tool_result', timestamp, tool_status: 'unconfirmed',
          content: 'Execution is unconfirmed: this saved operation has no matching recorded host result. Opening these details does not execute it.' } });
      return '';
    } catch { return whole; }
  }).trim();
  return { prose, pairs };
}
