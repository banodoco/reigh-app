import type { LiveSceneExecution, LiveSceneRequest, LiveSceneResult, LiveSceneScope } from '@/sdk/video/liveSceneAuthoring';
import { LIVE_SCENE_MAX_RESULT_BYTES } from './liveSceneOperationPort';
import type { LiveSceneBinding, LiveSceneReadAuthority } from './liveSceneOperationPort';

const digest = /^sha256:[a-f0-9]{64}$/;
const id = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 160;
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
function fail(message: string): never { throw new Error(message); }

/** Uses the provider's captured binding and live authority, never reconstructed state. */
export async function executeLiveSceneOperation(
  request: LiveSceneRequest, scope: LiveSceneScope, binding: LiveSceneBinding,
  authority: LiveSceneReadAuthority, execution: LiveSceneExecution,
): Promise<LiveSceneResult> {
  execution.assertActive();
  if (request.action === 'publish') {
    const reads = authority.reads.filter((read) => read.binding === binding
      && Object.entries(read.result.capture).every(([key, expected]) => (request.capture as unknown as Record<string, unknown>)[key] === expected)
      && JSON.stringify(read.result.placementIds) === JSON.stringify(request.placementIds));
    if (!reads.length || request.replacements.some((edit) => !reads.some((read) => read.result.source.text.includes(edit.before)))) {
      fail('Publish requires the same session/turn capture and previously read exact source spans');
    }
  }
  const result = await binding.handler(request, execution);
  if (bytes(result) > LIVE_SCENE_MAX_RESULT_BYTES) fail('Live-scene result exceeds feedback limit');
  if (request.action === 'read') {
    execution.assertActive();
    if (result.kind !== 'read' || result.capture.projectId !== scope.projectId || result.capture.timelineId !== scope.timelineId
      || result.capture.capturedTimelineVersion !== scope.capturedTimelineVersion
      || !digest.test(result.capture.packageRevision) || !digest.test(result.capture.entryRevision)
      || !id(result.capture.packageObjectId) || !id(result.capture.entryObjectId)
      || typeof result.source?.text !== 'string' || result.source.text.length > request.length
      || !Number.isSafeInteger(result.source.offset) || result.source.offset < 0
      || !Number.isSafeInteger(result.source.totalLength) || result.source.totalLength < result.source.offset + result.source.text.length
      || !Array.isArray(result.timing) || result.timing.length !== request.placementIds.length
      || result.timing.some((time, index) => time.id !== request.placementIds[index] || !Number.isFinite(time.at) || !Number.isFinite(time.duration))
      || JSON.stringify(result.placementIds) !== JSON.stringify(request.placementIds)) fail('Invalid live-scene read result');
    authority.reads.push({ binding, result });
  } else if (result.kind !== 'published' || result.projectId !== scope.projectId || result.timelineId !== scope.timelineId
    || !digest.test(result.revision) || !digest.test(result.entryRevision)
    || !Number.isSafeInteger(result.flushReceipt?.version) || result.flushReceipt.version <= scope.capturedTimelineVersion
    || result.acknowledgedTimelineVersion !== result.flushReceipt.version
    || JSON.stringify(result.affectedPlacements) !== JSON.stringify(request.placementIds)) fail('Invalid durable live-scene receipt');
  // Do not reclassify a durable commit as a cancelled write after flush.
  return result;
}
