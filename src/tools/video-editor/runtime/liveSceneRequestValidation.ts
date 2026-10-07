import type { LiveSceneRequest, LiveSceneScope } from '@/sdk/video/liveSceneAuthoring';
import { LIVE_SCENE_MAX_REQUEST_BYTES } from './liveSceneOperationPort';

const digest = /^sha256:[a-f0-9]{64}$/;
const unpairedSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).every((key) => keys.includes(key));
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function fail(message: string): never { throw new Error(message); }

export function validateLiveSceneRequest(value: unknown, scope: LiveSceneScope): LiveSceneRequest {
  if (!record(value) || bytes(value) > LIVE_SCENE_MAX_REQUEST_BYTES) fail('Live-scene request is malformed or oversized');
  if (value.schema !== 'reigh.live-scene-request/v1' || !id(value.requestId)
    || !record(value.scope)
    || !exactKeys(value.scope, Object.keys(scope))
    || Object.entries(scope).some(([key, expected]) => (value.scope as Record<string, unknown>)[key] !== expected)) fail('Live-scene request scope mismatch');
  if (!Array.isArray(value.placementIds) || value.placementIds.length < 1 || value.placementIds.length > 16
    || !value.placementIds.every(id) || new Set(value.placementIds).size !== value.placementIds.length) fail('Invalid live-scene placements');
  const common = ['schema', 'requestId', 'scope', 'placementIds', 'action'];
  if (value.action === 'read') {
    if (!exactKeys(value, [...common, 'offset', 'length', 'find']) || !Number.isSafeInteger(value.offset) || (value.offset as number) < 0
      || !Number.isSafeInteger(value.length) || (value.length as number) < 1 || (value.length as number) > 8192
      || (value.find !== undefined && (typeof value.find !== 'string' || !value.find || value.find.length > 512))) fail('Invalid live-scene read');
  } else if (value.action === 'publish') {
    const capture = value.capture;
    if (!exactKeys(value, [...common, 'capture', 'replacements']) || !record(capture)
      || !exactKeys(capture, ['projectId', 'timelineId', 'capturedTimelineVersion', 'packageRevision', 'entryRevision', 'packageObjectId', 'entryObjectId'])
      || capture.projectId !== scope.projectId || capture.timelineId !== scope.timelineId || capture.capturedTimelineVersion !== scope.capturedTimelineVersion
      || typeof capture.packageRevision !== 'string' || !digest.test(capture.packageRevision)
      || typeof capture.entryRevision !== 'string' || !digest.test(capture.entryRevision)
      || !id(capture.packageObjectId) || !id(capture.entryObjectId)
      || !Array.isArray(value.replacements) || value.replacements.length < 1 || value.replacements.length > 16
      || !value.replacements.every((edit) => record(edit) && exactKeys(edit, ['before', 'after'])
        && typeof edit.before === 'string' && edit.before.length > 0 && edit.before.length <= 8192
        && !unpairedSurrogate.test(edit.before)
        && typeof edit.after === 'string' && edit.after.length <= 8192 && !unpairedSurrogate.test(edit.after))) fail('Invalid live-scene publish');
  } else fail('Unknown live-scene action');
  return structuredClone(value) as LiveSceneRequest;
}
