import { describe, expect, it, vi } from 'vitest';
import type { LiveSceneAuthoringHandler, LiveSceneCapture, LiveSceneRequest, LiveSceneScope } from '@/sdk/video/liveSceneAuthoring';
import type { TimelineReader } from '@/sdk/video/timeline/reader';
import { LiveSceneOperationPort } from './liveSceneOperationPort';
import { executeLiveSceneRequest, runLiveSceneAcpRoundtrip } from './liveSceneAcpRoundtrip';

const scope: LiveSceneScope = {
  sessionId: 'session-a', turnId: 'turn-a', projectId: 'project-a', timelineId: 'timeline-a', capturedTimelineVersion: 7,
};
const capture: LiveSceneCapture = {
  projectId: scope.projectId, timelineId: scope.timelineId, capturedTimelineVersion: 7,
  packageRevision: `sha256:${'a'.repeat(64)}`, entryRevision: `sha256:${'b'.repeat(64)}`,
  packageObjectId: 'package-a', entryObjectId: 'entry-a',
};
const read = (requestId = 'read-a'): LiveSceneRequest => ({
  schema: 'reigh.live-scene-request/v1', requestId, scope: { ...scope }, placementIds: ['scene-a'], action: 'read', offset: 0, length: 100,
});
const publish = (requestId = 'publish-a'): LiveSceneRequest => ({
  schema: 'reigh.live-scene-request/v1', requestId, scope: { ...scope }, placementIds: ['scene-a'],
  action: 'publish', capture: { ...capture }, replacements: [{ before: 'old', after: 'new' }],
});
function deferred() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function fixture() {
  const gate = deferred();
  const load = vi.fn(async () => { await gate.promise; return import('./liveSceneOperationExecution'); });
  const port = new LiveSceneOperationPort(load);
  const current = { projectId: scope.projectId, timelineId: scope.timelineId, baseVersion: 7 };
  port.setReader({ snapshot: () => current } as TimelineReader);
  const handler = vi.fn<LiveSceneAuthoringHandler>(async (request) => request.action === 'read' ? {
    kind: 'read', capture: { ...capture }, placementIds: ['scene-a'],
    source: { offset: 0, text: 'old', totalLength: 3 }, timing: [{ id: 'scene-a', at: 2, duration: 20 }],
  } : {
    kind: 'published', projectId: scope.projectId, timelineId: scope.timelineId,
    revision: `sha256:${'c'.repeat(64)}`, entryRevision: `sha256:${'d'.repeat(64)}`,
    affectedPlacements: ['scene-a'], acknowledgedTimelineVersion: 8, flushReceipt: { version: 8 },
  });
  const registration = port.registration('com.reigh.astrid.live-scenes')!;
  const binding = registration.register(handler);
  const controller = new AbortController();
  return { gate, load, port, current, handler, registration, binding, controller };
}

describe('deferred live-scene operation implementation', () => {
  it.each([{}, read(), JSON.parse('{}'), { request: read(), scope }])(
    'rejects forged admission before loading, replay reservation or turn authority (%j)', async (ticket) => {
      const { port, load, handler, gate, controller } = fixture();
      await expect(port.execute(ticket, controller.signal)).rejects.toThrow('Invalid live-scene admission ticket');
      expect(load).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
      port.endTurn(scope);
      gate.resolve();
      await expect(executeLiveSceneRequest(port, read(), scope, controller.signal)).resolves.toMatchObject({ kind: 'read' });
    },
  );

  it('binds real host tickets to one exact port and consumes them once without exposing snapshots', async () => {
    const first = fixture();
    const second = fixture();
    const original = first.port.execute.bind(first.port);
    const capturedScope = { ...scope };
    const request = read();
    const intercepted = vi.spyOn(first.port, 'execute').mockImplementationOnce(async (ticket, signal) => {
      expect(Object.getPrototypeOf(ticket)).toBeNull();
      expect(Reflect.ownKeys(ticket)).toEqual([]);
      expect(Object.isFrozen(ticket)).toBe(true);
      expect(Reflect.set(ticket, 'request', publish())).toBe(false);
      expect(Reflect.set(ticket, 'scope', { ...scope, projectId: 'substitute' })).toBe(false);
      await expect(second.port.execute(ticket, signal)).rejects.toThrow('Invalid live-scene admission ticket');
      expect(second.load).not.toHaveBeenCalled();
      second.port.endTurn(scope);
      for (const substitute of [{ ...ticket }, { ...ticket, request: publish() }, { ...ticket, scope: { ...scope, turnId: 'substitute' } }]) {
        await expect(original(substitute, signal)).rejects.toThrow('Invalid live-scene admission ticket');
      }
      expect(first.load).not.toHaveBeenCalled();
      // Substitutes and wrong-port use did not create authority or consume the
      // real ticket; caller-owned data cannot change its captured snapshots.
      first.port.endTurn(scope);
      capturedScope.sessionId = 'substitute';
      request.placementIds[0] = 'substitute';
      const result = await original(ticket, signal);
      await expect(original(ticket, signal)).rejects.toThrow('Invalid live-scene admission ticket');
      return result;
    });
    first.gate.resolve();
    second.gate.resolve();
    await expect(executeLiveSceneRequest(first.port, request, capturedScope, first.controller.signal)).resolves.toMatchObject({ kind: 'read' });
    expect(intercepted).toHaveBeenCalledOnce();
    expect(first.handler.mock.calls[0][0]).toEqual(read());
    await expect(executeLiveSceneRequest(second.port, read(), scope, second.controller.signal)).resolves.toMatchObject({ kind: 'read' });
  });

  it('creates and registers the provider port synchronously without loading execution', () => {
    const { load, registration, binding, handler } = fixture();
    expect(load).not.toHaveBeenCalled();
    expect(() => registration.register(handler)).toThrow('already registered');
    binding.dispose();
    expect(() => registration.register(handler)).not.toThrow();
    expect(load).not.toHaveBeenCalled();
  });

  it.each(['cancel', 'unavailable', 'dispose', 'replace', 'project', 'timeline', 'version', 'reader'] as const)(
    'rejects %s during loading before invoking any handler', async (action) => {
      const { port, handler, binding, registration, current, gate, load, controller } = fixture();
      const replacement = vi.fn<LiveSceneAuthoringHandler>();
      const pending = executeLiveSceneRequest(port, read(), scope, controller.signal);
      expect(load).toHaveBeenCalledOnce();
      if (action === 'cancel') controller.abort();
      if (action === 'unavailable') port.setAvailable(false);
      if (action === 'dispose' || action === 'replace') binding.dispose();
      if (action === 'replace') registration.register(replacement);
      if (action === 'project') current.projectId = 'other-project';
      if (action === 'timeline') current.timelineId = 'other-timeline';
      if (action === 'version') current.baseVersion = 8;
      if (action === 'reader') port.setReader(undefined);
      gate.resolve();
      await expect(pending).rejects.toThrow(/cancelled|unavailable|disposed|scope changed|stale/);
      expect(handler).not.toHaveBeenCalled();
      expect(replacement).not.toHaveBeenCalled();
    },
  );

  it.each(['cancel', 'unavailable', 'dispose', 'project', 'timeline', 'version', 'reader'] as const)(
    'rejects an already inactive %s capture without starting a load', async (action) => {
      const { port, handler, binding, current, load, controller } = fixture();
      if (action === 'cancel') controller.abort();
      if (action === 'unavailable') port.setAvailable(false);
      if (action === 'dispose') binding.dispose();
      if (action === 'project') current.projectId = 'other-project';
      if (action === 'timeline') current.timelineId = 'other-timeline';
      if (action === 'version') current.baseVersion = 8;
      if (action === 'reader') port.setReader(undefined);
      await expect(executeLiveSceneRequest(port, read(), scope, controller.signal)).rejects.toThrow(/cancelled|unavailable|disposed|scope changed|stale/);
      expect(load).not.toHaveBeenCalled();
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it('never adopts a handler registered after an invocation captured no binding', async () => {
    const { port, binding, registration, handler, gate, load, controller } = fixture();
    binding.dispose();
    const pending = executeLiveSceneRequest(port, read(), scope, controller.signal);
    const rejection = expect(pending).rejects.toThrow('unavailable');
    const replacement = vi.fn<LiveSceneAuthoringHandler>(handler.getMockImplementation()!);
    registration.register(replacement);
    gate.resolve();
    await rejection;
    expect(load).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    await expect(executeLiveSceneRequest(port, read(), scope, controller.signal)).rejects.toThrow('replay');
    await expect(executeLiveSceneRequest(port, read('registered-later'), scope, controller.signal)).resolves.toMatchObject({ kind: 'read' });
    expect(replacement).toHaveBeenCalledOnce();
  });

  it('keeps captured request/scope identity when caller objects change while loading', async () => {
    const { port, handler, gate, controller } = fixture();
    const capturedScope = { ...scope };
    const request = read();
    const pending = executeLiveSceneRequest(port, request, capturedScope, controller.signal);
    capturedScope.sessionId = 'replacement-session';
    capturedScope.turnId = 'replacement-turn';
    capturedScope.projectId = 'replacement';
    capturedScope.timelineId = 'replacement';
    capturedScope.capturedTimelineVersion = 8;
    request.scope.timelineId = 'replacement';
    request.placementIds[0] = 'replacement';
    request.requestId = 'replacement';
    gate.resolve();
    await expect(pending).resolves.toMatchObject({ kind: 'read' });
    expect(handler.mock.calls[0][0]).toEqual(read());
    await expect(executeLiveSceneRequest(port, read(), scope, controller.signal)).rejects.toThrow('replay');
    await expect(executeLiveSceneRequest(port, read('replacement'), scope, controller.signal)).resolves.toMatchObject({ kind: 'read' });
  });

  it('captures nested publication data before loading even when caller edits it', async () => {
    const { port, handler, gate, controller } = fixture();
    const request = publish();
    const pending = executeLiveSceneRequest(port, request, scope, controller.signal);
    if (request.action !== 'publish') throw new Error('publish fixture expected');
    request.capture.entryRevision = 'invalid-replacement';
    request.replacements[0].before = '';
    request.replacements[0].after = '\uD800';
    gate.resolve();
    await expect(pending).rejects.toThrow('previously read exact source spans');
    await expect(executeLiveSceneRequest(port, publish(), scope, controller.signal)).rejects.toThrow('replay');
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    { ...read(), requestId: '' }, { ...read(), requestId: 'x'.repeat(161) },
    { ...read(), scope: { ...scope, turnId: 'wrong-turn' } },
    { ...read(), action: 'unknown' }, { ...read(), length: 8193 },
    { ...read(), find: 'x'.repeat(40_000) },
    { ...publish(), replacements: [{ before: '', after: 'new' }] },
  ])('rejects malformed admission without loading or reserving a replay identity (%j)', async (request) => {
    const { port, handler, gate, load, controller } = fixture();
    await expect(executeLiveSceneRequest(port, request, scope, controller.signal)).rejects.toThrow();
    expect(load).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    // No authority was created by the rejected request, so this is not an
    // ended turn and a corrected request can use the original ID.
    port.endTurn(scope);
    gate.resolve();
    const corrected = read(request.requestId && request.requestId.length <= 160 ? request.requestId : 'corrected');
    await expect(executeLiveSceneRequest(port, corrected, scope, controller.signal)).resolves.toMatchObject({ kind: 'read' });
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not restore read authority after endTurn during loading', async () => {
    const { port, handler, gate, controller } = fixture();
    const pending = executeLiveSceneRequest(port, read(), scope, controller.signal);
    port.endTurn(scope);
    gate.resolve();
    await expect(pending).rejects.toThrow('turn ended');
    await expect(executeLiveSceneRequest(port, publish(), scope, controller.signal)).rejects.toThrow('same session/turn');
    await expect(executeLiveSceneRequest(port, read('late-read'), scope, controller.signal)).rejects.toThrow('turn ended');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not restore read authority after endTurn during the handler await', async () => {
    const { port, handler, gate, controller } = fixture();
    const entered = deferred();
    const handlerGate = deferred();
    const original = handler.getMockImplementation()!;
    handler.mockImplementationOnce(async (request, execution) => {
      entered.resolve();
      await handlerGate.promise;
      return original(request, execution);
    });
    const pending = executeLiveSceneRequest(port, read(), scope, controller.signal);
    gate.resolve();
    await entered.promise;
    port.endTurn(scope);
    handlerGate.resolve();
    await expect(pending).rejects.toThrow('turn ended');
    await expect(executeLiveSceneRequest(port, publish(), scope, controller.signal)).rejects.toThrow('same session/turn');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('shares one first load and reserves duplicate/replay identities before loading', async () => {
    const { port, load, handler, gate, controller } = fixture();
    const first = executeLiveSceneRequest(port, read('first'), scope, controller.signal);
    const second = executeLiveSceneRequest(port, read('second'), scope, controller.signal);
    await expect(executeLiveSceneRequest(port, read('first'), scope, controller.signal)).rejects.toThrow('replay');
    expect(load).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
    gate.resolve();
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await expect(executeLiveSceneRequest(port, read('second'), scope, controller.signal)).rejects.toThrow('replay');
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('keeps replay/read authority independent between providers', async () => {
    const first = fixture();
    const second = fixture();
    first.gate.resolve();
    second.gate.resolve();
    await executeLiveSceneRequest(first.port, read(), scope, first.controller.signal);
    await expect(executeLiveSceneRequest(second.port, publish(), scope, second.controller.signal)).rejects.toThrow('previously read');
    await executeLiveSceneRequest(second.port, read(), scope, second.controller.signal);
    await expect(executeLiveSceneRequest(first.port, publish(), scope, first.controller.signal)).resolves.toMatchObject({ kind: 'published' });
    await expect(executeLiveSceneRequest(second.port, publish('publish-b'), scope, second.controller.signal)).resolves.toMatchObject({ kind: 'published' });
  });

  it('does not adopt read lineage from a disposed binding into its replacement', async () => {
    const { port, handler, binding, registration, gate, controller } = fixture();
    gate.resolve();
    await executeLiveSceneRequest(port, read(), scope, controller.signal);
    binding.dispose();
    const replacement = vi.fn<LiveSceneAuthoringHandler>(handler.getMockImplementation()!);
    registration.register(replacement);
    await expect(executeLiveSceneRequest(port, publish(), scope, controller.signal)).rejects.toThrow('previously read');
    expect(replacement).not.toHaveBeenCalled();
    await executeLiveSceneRequest(port, read('new-read'), scope, controller.signal);
    await expect(executeLiveSceneRequest(port, publish('new-publish'), scope, controller.signal)).resolves.toMatchObject({ kind: 'published' });
  });

  it('reports load rejection as correlated ACP failure and invokes no handler', async () => {
    const { port, load, handler, gate, controller } = fixture();
    const followup = vi.fn(async (_prompt: string) => 'The operation failed to load.');
    const pending = runLiveSceneAcpRoundtrip({
      content: `<reigh_live_scene_request>${JSON.stringify(read())}</reigh_live_scene_request>`,
      scope, port, signal: controller.signal, followup,
    });
    gate.reject(new Error('chunk unavailable'));
    const output = await pending;
    expect(output).toContain('Live-scene operation implementation failed to load: chunk unavailable');
    expect(followup.mock.calls[0][0]).toContain('"requestId":"read-a","ok":false');
    await expect(executeLiveSceneRequest(port, read('retry'), scope, controller.signal)).rejects.toThrow('failed to load');
    await expect(executeLiveSceneRequest(port, read(), scope, controller.signal)).rejects.toThrow('replay');
    expect(load).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it('retains both admitted identities when a shared first load fails', async () => {
    const { port, load, handler, gate, controller } = fixture();
    const first = expect(executeLiveSceneRequest(port, read('first'), scope, controller.signal)).rejects.toThrow('failed to load: chunk unavailable');
    const second = expect(executeLiveSceneRequest(port, read('second'), scope, controller.signal)).rejects.toThrow('failed to load: chunk unavailable');
    await expect(executeLiveSceneRequest(port, read('first'), scope, controller.signal)).rejects.toThrow('replay');
    gate.reject(new Error('chunk unavailable'));
    await Promise.all([first, second]);
    await expect(executeLiveSceneRequest(port, read('first'), scope, controller.signal)).rejects.toThrow('replay');
    await expect(executeLiveSceneRequest(port, read('second'), scope, controller.signal)).rejects.toThrow('replay');
    expect(load).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it('retains a durable publication success when cancellation and scope change follow flush', async () => {
    const { port, handler, current, gate, controller } = fixture();
    gate.resolve();
    await executeLiveSceneRequest(port, read(), scope, controller.signal);
    const original = handler.getMockImplementation()!;
    handler.mockImplementationOnce(async (request, execution) => {
      execution.assertActive();
      const receipt = await original(request, execution);
      current.baseVersion = 8;
      controller.abort();
      port.endTurn(scope);
      return receipt;
    });
    await expect(executeLiveSceneRequest(port, publish(), scope, controller.signal)).resolves.toMatchObject({
      kind: 'published', acknowledgedTimelineVersion: 8, flushReceipt: { version: 8 },
    });
  });

  it('rejects oversized handler feedback without granting read authority', async () => {
    const { port, handler, gate, controller } = fixture();
    gate.resolve();
    handler.mockResolvedValueOnce({
      kind: 'read', capture, placementIds: ['scene-a'], timing: [{ id: 'scene-a', at: 2, duration: 20 }],
      source: { offset: 0, text: 'x'.repeat(25_000), totalLength: 25_000 },
    });
    await expect(executeLiveSceneRequest(port, read(), scope, controller.signal)).rejects.toThrow('feedback limit');
    await expect(executeLiveSceneRequest(port, publish(), scope, controller.signal)).rejects.toThrow('previously read');
  });

  it('retains the bounded lifetime ledger without evicting old request IDs', async () => {
    const { port, handler, load, gate, controller } = fixture();
    const requests = Array.from({ length: 1024 }, (_, index) => executeLiveSceneRequest(port, read(`read-${index}`), scope, controller.signal));
    await expect(executeLiveSceneRequest(port, read('extra'), scope, controller.signal)).rejects.toThrow('budget exhausted');
    await expect(executeLiveSceneRequest(port, read('read-0'), scope, controller.signal)).rejects.toThrow('replay');
    expect(load).toHaveBeenCalledOnce();
    gate.resolve();
    await Promise.all(requests);
    expect(handler).toHaveBeenCalledTimes(1024);
  });
});
