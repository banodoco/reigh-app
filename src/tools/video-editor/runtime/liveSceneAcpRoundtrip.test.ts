import { describe, expect, it, vi } from 'vitest';
import type { LiveSceneAuthoringHandler, LiveSceneCapture, LiveSceneRequest, LiveSceneScope, LiveSceneResult } from '@/sdk/video/liveSceneAuthoring';
import type { TimelineReader } from '@/sdk/video/timeline/reader';
import { LiveSceneOperationPort } from './liveSceneOperationPort';
import { executeLiveSceneRequest, liveScenePromptContract, runLiveSceneAcpRoundtrip } from './liveSceneAcpRoundtrip';
import { validateLiveSceneRequest } from './liveSceneRequestValidation';
import { createExtensionContext } from './extensionContextFactory';
import { defineExtension, disposeExtensionContextServices } from '@reigh/editor-sdk';

const scope: LiveSceneScope = { sessionId: 'session-a', turnId: 'turn-a', projectId: 'project-a', timelineId: 'timeline-a', capturedTimelineVersion: 7 };
const capture: LiveSceneCapture = { projectId: scope.projectId, timelineId: scope.timelineId, capturedTimelineVersion: 7,
  packageRevision: `sha256:${'a'.repeat(64)}`, entryRevision: `sha256:${'b'.repeat(64)}`, packageObjectId: 'package-a', entryObjectId: 'entry-a' };
const read = (requestId = 'read-a'): LiveSceneRequest => ({ schema: 'reigh.live-scene-request/v1', requestId, scope, placementIds: ['scene-a'], action: 'read', offset: 0, length: 100 });
const publish = (requestId = 'publish-a'): LiveSceneRequest => ({ schema: 'reigh.live-scene-request/v1', requestId, scope, placementIds: ['scene-a'], action: 'publish', capture, replacements: [{ before: 'old', after: 'new' }] });
const requestText = (request: unknown) => `<reigh_live_scene_request>${JSON.stringify(request)}</reigh_live_scene_request>`;
const controller = () => new AbortController();
function fixture() {
  const port = new LiveSceneOperationPort();
  const current = { projectId: scope.projectId, timelineId: scope.timelineId, baseVersion: 7 };
  port.setReader({ snapshot: () => current } as TimelineReader);
  const handler = vi.fn<LiveSceneAuthoringHandler>(async (request) => request.action === 'read' ? {
    kind: 'read' as const, capture, placementIds: ['scene-a'], source: { offset: 0, text: 'old', totalLength: 3 },
    timing: [{ id: 'scene-a', at: 2, duration: 20, sourceOffset: 55, sourceEnd: 75, rate: 1 }],
  } : {
    kind: 'published' as const, projectId: scope.projectId, timelineId: scope.timelineId, revision: `sha256:${'c'.repeat(64)}`,
    entryRevision: `sha256:${'d'.repeat(64)}`, affectedPlacements: ['scene-a'], acknowledgedTimelineVersion: 8, flushReceipt: { version: 8 },
  });
  const binding = port.registration('com.reigh.astrid.live-scenes')!.register(handler);
  return { port, current, handler, binding };
}

describe('bounded live-scene ACP request/result bridge', () => {
  it('routes real ACP requests through opaque host validation and rejects wrong scope before execute', async () => {
    const { port, handler } = fixture();
    const execute = vi.spyOn(port, 'execute');
    const followup = vi.fn().mockResolvedValueOnce(requestText(read())).mockResolvedValueOnce('Acknowledged.');
    await runLiveSceneAcpRoundtrip({ content: requestText({ ...read(), scope: { ...scope, turnId: 'wrong' } }), scope, port,
      signal: controller().signal, followup });
    expect(followup.mock.calls[0][0]).toContain('scope mismatch');
    expect(execute).toHaveBeenCalledOnce();
    expect(execute.mock.calls[0]).toHaveLength(2);
    expect(Reflect.ownKeys(execute.mock.calls[0][0])).toEqual([]);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('feeds correlated source and durable publication results back to the originating model loop', async () => {
    const { port, handler } = fixture();
    const followup = vi.fn().mockResolvedValueOnce(requestText(publish())).mockResolvedValueOnce('Acknowledged the durable edit.');
    const output = await runLiveSceneAcpRoundtrip({ content: requestText(read()), scope, port, signal: controller().signal, followup });
    expect(handler).toHaveBeenCalledTimes(2);
    const first = followup.mock.calls[0][0];
    expect(first).toContain('"requestId":"read-a","ok":true');
    expect(first).toContain('"text":"old"');
    expect(first).toContain('"sourceOffset":55');
    expect(first).toContain('"sessionId":"session-a"');
    expect(followup.mock.calls[1][0]).toContain('"requestId":"publish-a","ok":true');
    expect(followup.mock.calls[1][0]).toContain('"flushReceipt":{"version":8}');
    expect(output).toContain('Scene published:');
    expect(output).toContain('Acknowledged the durable edit.');
    expect(output).not.toContain('reigh_live_scene_request');
    expect(liveScenePromptContract(scope)).toContain('reigh.live-scene-context/v1');
  });

  it.each([
    null, {}, { ...read(), action: 'delete' }, { ...read(), length: 8193 }, { ...read(), unknown: true },
    { ...read(), scope: { ...scope, sessionId: 'other' } }, { ...read(), scope: { ...scope, timelineId: 'other' } },
    { ...read(), placementIds: ['scene-a', 'scene-a'] }, { ...publish(), replacements: [{ before: '', after: 'new' }] },
    { ...read(), find: 'x'.repeat(40_000) },
    { ...publish(), replacements: [{ before: '\uD800', after: 'new' }] },
    { ...publish(), replacements: [{ before: 'old', after: '\uDC00' }] },
  ])('rejects malformed/unknown/oversized/mismatched requests before dispatch (%j)', (request) => {
    expect(() => validateLiveSceneRequest(request, scope)).toThrow();
  });

  it('binds only the rendering pack and rejects missing/disposed handlers', async () => {
    const missing = new LiveSceneOperationPort();
    expect(missing.registration('com.other.extension')).toBeUndefined();
    await expect(executeLiveSceneRequest(missing, read(), scope, controller().signal)).rejects.toThrow('unavailable');
    const { port, binding, handler } = fixture();
    binding.dispose();
    await expect(executeLiveSceneRequest(port, read(), scope, controller().signal)).rejects.toThrow('disposed');
    expect(handler).not.toHaveBeenCalled();
  });

  it('disposes the callback through host context cleanup even if activation never returns a handle', async () => {
    const { port, binding, handler } = fixture();
    binding.dispose();
    const extension = defineExtension({ manifest: { id: 'com.reigh.astrid.live-scenes' as never, version: '1.0.0', label: 'Scene', apiVersion: 1, contributions: [] },
      activate: () => ({ dispose() {} }) });
    const ctx = createExtensionContext(extension, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      port.registration('com.reigh.astrid.live-scenes'));
    ctx.liveSceneAuthoring!.register(handler);
    disposeExtensionContextServices(ctx);
    await expect(executeLiveSceneRequest(port, read(), scope, controller().signal)).rejects.toThrow('unavailable');
    expect(() => ctx.liveSceneAuthoring!.register(handler)).toThrow('disposed');
  });

  it('rejects replay, turn/capture mismatch and source edits that were not read', async () => {
    const { port, handler } = fixture();
    await executeLiveSceneRequest(port, read(), scope, controller().signal);
    await expect(executeLiveSceneRequest(port, read(), scope, controller().signal)).rejects.toThrow('replay');
    await expect(executeLiveSceneRequest(port, { ...publish(), capture: { ...capture, entryObjectId: 'other' } }, scope, controller().signal)).rejects.toThrow('same session');
    await expect(executeLiveSceneRequest(port, { ...publish('publish-b'), replacements: [{ before: 'unread', after: 'new' }] }, scope, controller().signal)).rejects.toThrow('previously read');
    const otherScope = { ...scope, turnId: 'turn-b' };
    await expect(executeLiveSceneRequest(port, { ...publish('publish-c'), scope: otherScope }, otherScope, controller().signal)).rejects.toThrow('same session');
    port.endTurn(scope);
    await expect(executeLiveSceneRequest(port, publish('publish-d'), scope, controller().signal)).rejects.toThrow('same session');
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects project/timeline/version changes and cancellation before dispatch', async () => {
    for (const change of [{ projectId: 'other' }, { timelineId: 'other' }, { baseVersion: 8 }]) {
      const { port, current, handler } = fixture();
      Object.assign(current, change);
      await expect(executeLiveSceneRequest(port, read(), scope, controller().signal)).rejects.toThrow(/scope changed|stale/);
      expect(handler).not.toHaveBeenCalled();
    }
    const { port, handler } = fixture();
    const cancel = controller(); cancel.abort();
    await expect(executeLiveSceneRequest(port, read(), scope, cancel.signal)).rejects.toThrow('cancelled');
    expect(handler).not.toHaveBeenCalled();
  });

  it('revalidates scope and handler disposal during asynchronous reads', async () => {
    for (const action of ['scope', 'dispose', 'cancel']) {
      const { port, current, handler, binding } = fixture();
      const cancel = controller();
      const original = handler.getMockImplementation()!;
      handler.mockImplementationOnce(async (request, execution) => {
        if (action === 'scope') current.projectId = 'other';
        if (action === 'dispose') binding.dispose();
        if (action === 'cancel') cancel.abort();
        return original(request, execution);
      });
      await expect(executeLiveSceneRequest(port, read(), scope, cancel.signal)).rejects.toThrow();
    }
  });

  it('reports cancellation after a durable commit accurately to the model', async () => {
    const { port, handler } = fixture();
    const cancel = controller();
    const original = handler.getMockImplementation()!;
    handler.mockImplementation(async (request, execution) => { const result = await original(request, execution); if (request.action === 'publish') cancel.abort(); return result; });
    const followup = vi.fn().mockResolvedValueOnce(requestText(publish())).mockResolvedValueOnce('Commit acknowledged despite cancellation.');
    const output = await runLiveSceneAcpRoundtrip({ content: requestText(read()), scope, port, signal: cancel.signal, followup });
    expect(followup.mock.calls[1][0]).toContain('"cancelledWithDurableCommit":true');
    expect(followup.mock.calls[1][0]).toContain('"ok":true');
    expect(output).toContain('cancellation was requested and the publication is durably committed');
  });

  it('feeds malformed JSON, unknown operations and durable failures back as failures', async () => {
    const { port, handler } = fixture();
    const original = handler.getMockImplementation()!;
    handler.mockImplementation(async (request, execution) => { if (request.action === 'publish') throw new Error('durable timeline persistence unavailable'); return original(request, execution); });
    const followup = vi.fn().mockResolvedValueOnce(requestText({ ...read(), action: 'unknown' }))
      .mockResolvedValueOnce(requestText(read())).mockResolvedValueOnce(requestText(publish())).mockResolvedValueOnce('Failure acknowledged.');
    const output = await runLiveSceneAcpRoundtrip({ content: '<reigh_live_scene_request>{bad}</reigh_live_scene_request>', scope, port, signal: controller().signal, followup });
    expect(followup.mock.calls[0][0]).toContain('"ok":false');
    expect(followup.mock.calls[1][0]).toContain('Unknown live-scene action');
    expect(followup.mock.calls[3][0]).toContain('durable timeline persistence unavailable');
    expect(output).not.toContain('Scene published:');
  });

  it('rejects null or unacknowledged publication results', async () => {
    const { port, handler } = fixture();
    await executeLiveSceneRequest(port, read(), scope, controller().signal);
    handler.mockResolvedValueOnce({ kind: 'published', ...scope, revision: capture.packageRevision, entryRevision: capture.entryRevision,
      affectedPlacements: ['scene-a'], acknowledgedTimelineVersion: 7, flushReceipt: { version: 7 } });
    await expect(executeLiveSceneRequest(port, publish(), scope, controller().signal)).rejects.toThrow('durable');
    handler.mockResolvedValueOnce(null as unknown as LiveSceneResult);
    await expect(executeLiveSceneRequest(port, publish('publish-null'), scope, controller().signal)).rejects.toThrow();
  });

  it('feeds a missing handler back to the model with the matching request ID', async () => {
    const followup = vi.fn(async (_prompt: string) => 'The scene handler is unavailable.');
    await runLiveSceneAcpRoundtrip({ content: requestText(read()), scope, signal: controller().signal, followup });
    expect(followup.mock.calls[0][0]).toContain('"requestId":"read-a","ok":false');
    expect(followup.mock.calls[0][0]).toContain('handler unavailable');
  });

  it('bounds continuations and refuses extra requests instead of evicting replay identities', async () => {
    const { port, handler } = fixture();
    let index = 1;
    const followup = vi.fn(async () => requestText(read(`read-${index++}`)));
    const output = await runLiveSceneAcpRoundtrip({ content: requestText(read('read-0')), scope, port, signal: controller().signal, followup });
    expect(handler).toHaveBeenCalledTimes(6);
    expect(followup).toHaveBeenCalledTimes(6);
    expect(output).toContain('continuation limit');
  });

  it('retains accurate durable outcome if the feedback transport fails', async () => {
    const { port } = fixture();
    await executeLiveSceneRequest(port, read(), scope, controller().signal);
    const output = await runLiveSceneAcpRoundtrip({ content: requestText(publish()), scope, port, signal: controller().signal,
      followup: async () => { throw new Error('ACP disconnected'); } });
    expect(output).toContain('Scene published:');
    expect(output).toContain('feedback could not be delivered');
  });
});
