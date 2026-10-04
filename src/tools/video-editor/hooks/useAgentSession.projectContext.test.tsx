import { writeFileSync } from "node:fs";
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentChatEditorContext } from '@/shared/contexts/AgentChatContext.tsx';
import type { LiveSceneAuthoringHandler, LiveSceneCapture, LiveSceneRequest, LiveSceneScope } from '@/sdk/video/liveSceneAuthoring';
import type { TimelineReader } from '@/sdk/video/timeline/reader';
import { LiveSceneOperationPort } from '@/tools/video-editor/runtime/liveSceneOperationPort';
import {
  agentSessionsQueryKey,
  AstridAgentSessionStore,
  useAgentSession,
  useAgentSessions,
  useCreateSession,
  useSendMessage,
} from './useAgentSession.ts';

const acp = vi.hoisted(() => ({
  connect: vi.fn().mockResolvedValue({ connection_id: 'connection-1' }),
  loadSession: vi.fn().mockResolvedValue({}),
  listSessions: vi.fn().mockResolvedValue({ sessions: [{ session_id: 'persisted-session' }] }),
  createSession: vi.fn().mockResolvedValue({ session_id: 'created-session' }),
  promptSession: vi.fn().mockResolvedValue({}),
  events: vi.fn().mockResolvedValue({ notifications: [], disconnected: false }),
  cancelSession: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/integrations/astrid/client.ts', () => ({ AstridLocalClient: class { acp = acp; } }));
afterAll(() => { if (process.env.ASTRID_REIGH_CONTEXT_EVIDENCE) writeFileSync(process.env.ASTRID_REIGH_CONTEXT_EVIDENCE, JSON.stringify(acp.promptSession.mock.calls, null, 2)); });
function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
function createTestWrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return {
    client,
    Wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  };
}
beforeEach(() => {
  acp.connect.mockReset().mockResolvedValue({ connection_id: 'connection-1' });
  acp.loadSession.mockReset().mockResolvedValue({});
  acp.listSessions.mockReset().mockResolvedValue({ sessions: [{ session_id: 'persisted-session' }] });
  acp.createSession.mockReset().mockResolvedValue({ session_id: 'created-session' });
  acp.promptSession.mockReset().mockResolvedValue({});
  acp.events.mockReset().mockResolvedValue({ notifications: [], disconnected: false });
  acp.cancelSession.mockReset().mockResolvedValue({});
});
function context(projectId: string): AgentChatEditorContext {
  return { tool: 'video-editor', projectId, projectSlug: projectId + '-slug', timelineId: null, timelineName: null };
}
function snapshot(index: number) {
  const block = acp.promptSession.mock.calls[index][2][1].text as string;
  return JSON.parse(block.split('<reigh_editor_context>\n')[1].split('\n</reigh_editor_context>')[0]);
}

function assistantNotification(sessionId: string, text: string) {
  return { params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } } };
}

function sceneCapture(scope: LiveSceneScope): LiveSceneCapture {
  return {
    projectId: scope.projectId,
    timelineId: scope.timelineId,
    capturedTimelineVersion: scope.capturedTimelineVersion,
    packageRevision: `sha256:${'a'.repeat(64)}`,
    entryRevision: `sha256:${'b'.repeat(64)}`,
    packageObjectId: 'package-a',
    entryObjectId: 'entry-a',
  };
}

function sceneRead(scope: LiveSceneScope, requestId: string): LiveSceneRequest {
  return { schema: 'reigh.live-scene-request/v1', requestId, scope, placementIds: ['scene-a'], action: 'read', offset: 0, length: 100 };
}

function scenePublish(scope: LiveSceneScope, capture: LiveSceneCapture, requestId: string): LiveSceneRequest {
  return { schema: 'reigh.live-scene-request/v1', requestId, scope, placementIds: ['scene-a'], action: 'publish', capture, replacements: [{ before: 'old', after: 'new' }] };
}

function sceneRequestText(request: LiveSceneRequest): string {
  return `<reigh_live_scene_request>${JSON.stringify(request)}</reigh_live_scene_request>`;
}

function sceneScopeFromPrompt(blocks: Array<{ type: string; text: string }>): LiveSceneScope {
  const block = blocks.find(({ text }) => text.startsWith('<reigh_live_scene_context>'))?.text;
  if (!block) throw new Error('No live-scene prompt contract was sent.');
  return JSON.parse(block.slice('<reigh_live_scene_context>'.length, -'</reigh_live_scene_context>'.length)).scope as LiveSceneScope;
}

function scenePort(projectId: string, timelineId: string, baseVersion: number, handler?: LiveSceneAuthoringHandler) {
  const port = new LiveSceneOperationPort();
  const current = { projectId, timelineId, baseVersion };
  port.setReader({ snapshot: () => current } as unknown as TimelineReader);
  const operation = handler ?? vi.fn<LiveSceneAuthoringHandler>(async (request) => request.action === 'read' ? {
    kind: 'read',
    capture: sceneCapture(request.scope),
    placementIds: ['scene-a'],
    source: { offset: 0, text: 'old', totalLength: 3 },
    timing: [{ id: 'scene-a', at: 2, duration: 20, sourceOffset: 0, sourceEnd: 3, rate: 1 }],
  } : {
    kind: 'published',
    projectId,
    timelineId,
    revision: `sha256:${'c'.repeat(64)}`,
    entryRevision: `sha256:${'d'.repeat(64)}`,
    affectedPlacements: ['scene-a'],
    acknowledgedTimelineVersion: baseVersion + 1,
    flushReceipt: { version: baseVersion + 1 },
  });
  const binding = port.registration('com.reigh.astrid.live-scenes')!.register(operation);
  return { port, current, handler: operation, binding };
}

function agentContext(projectId: string, timelineId: string, port?: LiveSceneOperationPort): AgentChatEditorContext {
  return {
    tool: 'video-editor', projectId, projectSlug: `${projectId}-slug`, timelineId, timelineName: 'Main',
    timelineSummary: { configVersion: 7, trackCount: 1, clipCount: 1, assetCount: 1, duration: 3 },
    ...(port ? { liveSceneOperationPort: port } : {}),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function directStoreClient(acpClient: Record<string, unknown>) {
  return { acp: acpClient } as never;
}

describe('project-only ACP prompt boundary', () => {
  it('sends project identity on every turn, refreshes switches, and pins a failed retry to its original scope', async () => {
    const hook = renderHook(({ scope }) => useSendMessage('project-chat-session', scope), {
      wrapper, initialProps: { scope: context('first') },
    });
    await act(async () => { await hook.result.current.mutateAsync({ message: 'hello' }); });
    await act(async () => { await hook.result.current.mutateAsync({ message: 'follow-up' }); });
    expect(snapshot(0).project).toEqual({ id: 'first', slug: 'first-slug' });
    expect(snapshot(1).project).toEqual(snapshot(0).project);
    expect(snapshot(1).timeline.id).toBeNull();
    expect(snapshot(1).request_id).not.toBe(snapshot(0).request_id);
    hook.rerender({ scope: context('second') });
    acp.promptSession.mockRejectedValueOnce(new Error('response lost'));
    await expect(act(async () => { await hook.result.current.mutateAsync({ message: 'remember my choice' }); }))
      .rejects.toThrow('response lost');
    expect(snapshot(2).project.id).toBe('second');
    hook.rerender({ scope: context('third') });
    await act(async () => { await hook.result.current.retryLastMessage(); });
    expect(snapshot(3).project).toEqual(snapshot(2).project);
    await act(async () => { await hook.result.current.mutateAsync({ message: 'new project turn' }); });
    expect(snapshot(4).project.id).toBe('third');
    hook.unmount();
  });

  it('keeps project and timeline in distinct ACP session-list cache keys and permits project-only list/create', async () => {
    expect(agentSessionsQueryKey(null, 'project-a')).toEqual(['timeline-agent-sessions', null, 'project-a']);
    expect(agentSessionsQueryKey('timeline-a', 'project-a')).not.toEqual(agentSessionsQueryKey('timeline-a', 'project-b'));
    expect(agentSessionsQueryKey(null, 'project-a')).not.toEqual(agentSessionsQueryKey('timeline-a', 'project-a'));

    const { Wrapper } = createTestWrapper();
    const list = renderHook(() => useAgentSessions(null, 'project-a'), { wrapper: Wrapper });
    await waitFor(() => expect(list.result.current.data).toEqual([{ id: 'persisted-session', status: 'waiting_user' }]));
    expect(acp.listSessions).toHaveBeenCalledOnce();
    const create = renderHook(() => useCreateSession(null, 'project-a'), { wrapper: Wrapper });
    await act(async () => { await create.result.current.mutateAsync(); });
    expect(acp.createSession).toHaveBeenCalledOnce();
    list.unmount();
    create.unmount();
  });

  it('rejects chat creation and sends when neither project nor timeline is selected', async () => {
    const { Wrapper } = createTestWrapper();
    const noScope = { tool: 'video-editor' as const, projectId: null, projectSlug: null, timelineId: null, timelineName: null };
    const send = renderHook(() => useSendMessage('no-scope-session', noScope), { wrapper: Wrapper });
    await expect(act(async () => { await send.result.current.mutateAsync({ message: 'no scope' }); }))
      .rejects.toThrow('Select a project or timeline to chat.');
    const create = renderHook(() => useCreateSession(null, null), { wrapper: Wrapper });
    await expect(act(async () => { await create.result.current.mutateAsync(); }))
      .rejects.toThrow('Select a project or timeline to start chatting.');
    expect(acp.promptSession).not.toHaveBeenCalled();
    expect(acp.createSession).not.toHaveBeenCalled();
    send.unmount();
    create.unmount();
  });

  it('does not advertise or execute a stale scene port in project-only chat and does not invalidate a null timeline', async () => {
    const selectedPort = new LiveSceneOperationPort();
    const execute = vi.spyOn(selectedPort, 'execute');
    const endTurn = vi.spyOn(selectedPort, 'endTurn');
    const { client, Wrapper } = createTestWrapper();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const staleProjectContext: AgentChatEditorContext = {
      ...context('project-only'),
      timelineSummary: { configVersion: 7, trackCount: 1, clipCount: 1, assetCount: 1, duration: 3 },
      liveSceneOperationPort: selectedPort,
    };
    acp.events.mockResolvedValueOnce({
      notifications: [assistantNotification('project-marker-session', sceneRequestText(sceneRead({
        sessionId: 'project-marker-session', turnId: 'stale-turn', projectId: 'project-only', timelineId: 'stale-timeline', capturedTimelineVersion: 7,
      }, 'stale-read')))],
      disconnected: false,
    });
    const send = renderHook(() => useSendMessage('project-marker-session', staleProjectContext), { wrapper: Wrapper });
    await act(async () => { await send.result.current.mutateAsync({ message: 'edit a project brief' }); });

    expect(acp.promptSession).toHaveBeenCalledOnce();
    expect(acp.promptSession.mock.calls[0][2]).toHaveLength(2);
    expect(acp.promptSession.mock.calls[0][2].some(({ text }: { text: string }) => text.includes('reigh_live_scene_context'))).toBe(false);
    expect(snapshot(0).project).toEqual({ id: 'project-only', slug: 'project-only-slug' });
    expect(snapshot(0).timeline).toEqual({ id: null, name: null });
    expect(execute).not.toHaveBeenCalled();
    expect(endTurn).not.toHaveBeenCalled();
    expect(invalidate.mock.calls.map(([filters]) => filters.queryKey)).toEqual([['timeline-agent-session', 'project-marker-session']]);
    send.unmount();
  });

  it.each([
    { kind: 'without a host port', editorContext: agentContext('project-without-port', 'timeline-without-port') },
    { kind: 'with an invalid captured version', editorContext: agentContext('project-invalid-version', 'timeline-invalid-version', scenePort('project-invalid-version', 'timeline-invalid-version', 7).port) },
  ] as const)('keeps timeline chat supported $kind without advertising scene operations', async ({ kind, editorContext }) => {
    const selectedPort = editorContext.liveSceneOperationPort;
    const execute = selectedPort ? vi.spyOn(selectedPort, 'execute') : null;
    const endTurn = selectedPort ? vi.spyOn(selectedPort, 'endTurn') : null;
    const capturedContext = kind === 'with an invalid captured version'
      ? { ...editorContext, timelineSummary: { ...editorContext.timelineSummary!, configVersion: -1 } }
      : editorContext;
    const sessionId = `timeline-no-scene-contract-${kind}`;
    acp.events.mockResolvedValueOnce({
      notifications: [assistantNotification(sessionId, sceneRequestText(sceneRead({
        sessionId, turnId: 'unscoped-turn', projectId: editorContext.projectId!, timelineId: editorContext.timelineId!, capturedTimelineVersion: 7,
      }, 'unscoped-read')))],
      disconnected: false,
    });
    const send = renderHook(() => useSendMessage(sessionId, capturedContext), { wrapper });
    await act(async () => { await send.result.current.mutateAsync({ message: 'inspect this timeline' }); });

    expect(acp.promptSession).toHaveBeenCalledOnce();
    expect(acp.promptSession.mock.calls[0][2]).toHaveLength(2);
    expect(acp.promptSession.mock.calls[0][2].some(({ text }: { text: string }) => text.includes('reigh_live_scene_context'))).toBe(false);
    expect(snapshot(0).timeline.id).toBe(editorContext.timelineId);
    if (execute) expect(execute).not.toHaveBeenCalled();
    if (endTurn) expect(endTurn).not.toHaveBeenCalled();
    send.unmount();
  });

  it('rejects a retry before ACP when the active session differs from its captured session', async () => {
    const hook = renderHook(({ sessionId, scope }) => useSendMessage(sessionId, scope), {
      wrapper, initialProps: { sessionId: 'session-original', scope: context('project-original') },
    });
    acp.promptSession.mockRejectedValueOnce(new Error('response lost'));
    await expect(act(async () => { await hook.result.current.mutateAsync({ message: 'pin this request' }); })).rejects.toThrow('response lost');
    const callsBeforeRetry = acp.promptSession.mock.calls.length;
    hook.rerender({ sessionId: 'session-selected', scope: context('project-selected') });
    await expect(act(async () => { await hook.result.current.retryLastMessage(); })).rejects.toThrow('original session');
    expect(acp.promptSession).toHaveBeenCalledTimes(callsBeforeRetry);
    hook.unmount();
  });

  it('keeps a new send from consuming an in-flight retry payload', async () => {
    const hook = renderHook(({ scope }) => useSendMessage('session-race', scope), {
      wrapper, initialProps: { scope: context('project-original') },
    });
    acp.promptSession.mockRejectedValueOnce(new Error('response lost'));
    await expect(act(async () => { await hook.result.current.mutateAsync({ message: 'retry me' }); })).rejects.toThrow('response lost');
    hook.rerender({ scope: context('project-current') });
    const gate = deferred<object>();
    acp.promptSession.mockImplementationOnce(() => gate.promise);
    let retry!: Promise<unknown>;
    act(() => { retry = hook.result.current.retryLastMessage(); });
    await waitFor(() => expect(acp.promptSession).toHaveBeenCalledTimes(2));
    expect(snapshot(1).project.id).toBe('project-original');
    await expect(act(async () => { await hook.result.current.mutateAsync({ message: 'new current message' }); }))
      .rejects.toThrow('already being sent or retried');
    expect(acp.promptSession).toHaveBeenCalledTimes(2);
    await act(async () => { gate.reject(new Error('retry response lost')); await expect(retry).rejects.toThrow('retry response lost'); });
    await act(async () => { await hook.result.current.retryLastMessage(); });
    expect(snapshot(2).project.id).toBe('project-original');
    hook.unmount();
  });

  it('composes Scenes and Elements on one captured timeline turn and returns the durable receipt through ACP follow-ups', async () => {
    const sessionId = 'combined-scenes-elements-session';
    const selected = scenePort('project-scene', 'timeline-scene', 7);
    const elementExecute = vi.fn().mockResolvedValue({ operation: 'elements.update', config_version: 8 });
    const replies: string[] = [];
    let scope: LiveSceneScope | null = null;
    let followup = 0;
    const fakeAcp = {
      connect: vi.fn().mockResolvedValue({ connection_id: 'one-connection' }),
      loadSession: vi.fn().mockResolvedValue({}),
      promptSession: vi.fn(async (_connectionId: string, _sessionId: string, blocks: Array<{ type: string; text: string }>) => {
        if (blocks.length === 3) {
          scope = sceneScopeFromPrompt(blocks);
          replies.push([
            'I will update the selected element.',
            '<reigh_element_operation>{"name":"elements.update","id":"effect-a"}</reigh_element_operation>',
            sceneRequestText(sceneRead(scope, 'read-1')),
          ].join('\n'));
        } else if (followup++ === 0 && scope) {
          replies.push(sceneRequestText(scenePublish(scope, sceneCapture(scope), 'publish-1')));
        } else {
          replies.push('The host receipt confirms the scene publication.');
        }
        return {};
      }),
      events: vi.fn(async () => ({ notifications: [assistantNotification(sessionId, replies.shift() ?? '')], disconnected: false })),
    };
    const store = new AstridAgentSessionStore(directStoreClient(fakeAcp));
    const editorContext = { ...agentContext('project-scene', 'timeline-scene', selected.port), elementOperationAdapter: { execute: elementExecute } as never };
    await store.prompt(sessionId, { message: 'update the scene and effect' }, editorContext);
    const promptCalls = fakeAcp.promptSession.mock.calls;
    expect(promptCalls).toHaveLength(3);
    expect(promptCalls.every(([connectionId, promptedSession]) => connectionId === 'one-connection' && promptedSession === sessionId)).toBe(true);
    expect(promptCalls[0][2]).toHaveLength(3);
    expect(promptCalls[0][2][2].text).toContain('reigh.live-scene-context/v1');
    expect(elementExecute).toHaveBeenCalledExactlyOnceWith({ name: 'elements.update', id: 'effect-a' });
    expect(selected.handler).toHaveBeenCalledTimes(2);
    expect(selected.handler.mock.calls.map(([request]) => request.action)).toEqual(['read', 'publish']);
    expect(promptCalls[1][2][0].text).toContain('"kind":"read"');
    expect(promptCalls[2][2][0].text).toContain('"cancelledWithDurableCommit":false');
    const session = await store.get(sessionId);
    expect(session.turns.at(-1)?.content).toContain('elements.update: applied');
    expect(session.turns.at(-1)?.content).toContain('Scene published:');
  });

  it('retries the captured scene port after selection changes with a fresh turn and read admission', async () => {
    const sessionId = 'scene-retry-session';
    const selected = scenePort('project-retry', 'timeline-retry', 7);
    const newlySelected = scenePort('project-selected-after-failure', 'timeline-selected-after-failure', 9);
    const pending: unknown[] = [];
    const scopes: LiveSceneScope[] = [];
    let attempt = 0;
    acp.events.mockImplementation(async () => ({ notifications: pending.splice(0), disconnected: false }));
    acp.promptSession.mockImplementation(async (_connectionId: string, promptedSession: string, blocks: Array<{ type: string; text: string }>) => {
      if (blocks.length === 3) {
        const scope = sceneScopeFromPrompt(blocks);
        scopes.push(scope);
        pending.push(assistantNotification(promptedSession, sceneRequestText(sceneRead(scope, `read-${++attempt}`))));
      } else {
        pending.push(assistantNotification(promptedSession, 'Read completed.'));
      }
      return {};
    });
    const originalEndTurn = selected.port.endTurn.bind(selected.port);
    const finishTurn = vi.spyOn(selected.port, 'endTurn');
    finishTurn.mockImplementationOnce((capturedScope) => {
      originalEndTurn(capturedScope);
      throw new Error('simulated post-read failure');
    });
    const { Wrapper } = createTestWrapper();
    const hook = renderHook(({ scope }) => useSendMessage(sessionId, scope), {
      wrapper: Wrapper,
      initialProps: { scope: agentContext('project-retry', 'timeline-retry', selected.port) },
    });
    await expect(act(async () => { await hook.result.current.mutateAsync({ message: 'read the scene' }); }))
      .rejects.toThrow('simulated post-read failure');
    expect(selected.handler).toHaveBeenCalledOnce();

    hook.rerender({ scope: agentContext('project-selected-after-failure', 'timeline-selected-after-failure', newlySelected.port) });
    await act(async () => { await hook.result.current.retryLastMessage(); });

    expect(acp.promptSession).toHaveBeenCalledTimes(4);
    expect(selected.handler.mock.calls.map(([request]) => request.action)).toEqual(['read', 'read']);
    expect(scopes).toHaveLength(2);
    expect(scopes[1].turnId).not.toBe(scopes[0].turnId);
    expect(scopes.every(({ projectId, timelineId }) => projectId === 'project-retry' && timelineId === 'timeline-retry')).toBe(true);
    expect(newlySelected.handler).not.toHaveBeenCalled();
    expect(finishTurn).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it.each([
    { kind: 'version', expectedError: 'captured revision is stale' },
    { kind: 'timeline', expectedError: 'provider scope changed' },
    { kind: 'disposed', expectedError: 'handler unavailable or disposed' },
  ] as const)('rejects a stale $kind capture on the original port after selection changes', async ({ kind, expectedError }) => {
    const sessionId = 'scene-stale-port-session';
    const stale = scenePort('project-old', 'timeline-old', 7);
    const newlySelected = scenePort('project-new', 'timeline-new', 9);
    const oldExecute = vi.spyOn(stale.port, 'execute');
    const newExecute = vi.spyOn(newlySelected.port, 'execute');
    const endTurn = vi.spyOn(stale.port, 'endTurn');
    if (kind === 'version') stale.current.baseVersion = 8;
    if (kind === 'timeline') Object.assign(stale.current, { projectId: 'project-new', timelineId: 'timeline-new', baseVersion: 9 });
    if (kind === 'disposed') stale.binding.dispose();
    const replies: string[] = [];
    let scope: LiveSceneScope | null = null;
    const fakeAcp = {
      connect: vi.fn().mockResolvedValue({ connection_id: 'stale-connection' }),
      loadSession: vi.fn().mockResolvedValue({}),
      promptSession: vi.fn(async (_connectionId: string, _sessionId: string, blocks: Array<{ type: string; text: string }>) => {
        if (blocks.length === 3) {
          scope = sceneScopeFromPrompt(blocks);
          replies.push(sceneRequestText(sceneRead(scope, 'read-stale')));
        } else {
          replies.push('I will wait for the timeline to refresh.');
        }
        return {};
      }),
      events: vi.fn(async () => ({ notifications: [assistantNotification(sessionId, replies.shift() ?? '')], disconnected: false })),
    };
    const store = new AstridAgentSessionStore(directStoreClient(fakeAcp));
    await store.prompt(sessionId, { message: 'inspect the selected scene' }, agentContext('project-old', 'timeline-old', stale.port));
    expect(scope).toMatchObject({ projectId: 'project-old', timelineId: 'timeline-old', capturedTimelineVersion: 7 });
    expect(oldExecute).toHaveBeenCalledOnce();
    expect(stale.handler).not.toHaveBeenCalled();
    expect(newExecute).not.toHaveBeenCalled();
    expect(newlySelected.handler).not.toHaveBeenCalled();
    expect(fakeAcp.promptSession.mock.calls[1][2][0].text).toContain(expectedError);
    expect(endTurn).toHaveBeenCalledOnce();
  });

  it('ends the captured scene turn after loader failure and cancels before ACP prompt dispatch', async () => {
    const selected = scenePort('project-import', 'timeline-import', 7);
    const endTurn = vi.spyOn(selected.port, 'endTurn');
    const importClient = {
      connect: vi.fn().mockResolvedValue({ connection_id: 'import-connection' }),
      loadSession: vi.fn().mockResolvedValue({}),
      promptSession: vi.fn().mockResolvedValue({}),
      events: vi.fn().mockResolvedValue({ notifications: [], disconnected: false }),
    };
    const importFailureStore = new AstridAgentSessionStore(directStoreClient(importClient), async () => {
      throw new Error('scene ACP module unavailable');
    });
    await expect(importFailureStore.prompt('import-session', { message: 'scene edit' }, agentContext('project-import', 'timeline-import', selected.port)))
      .rejects.toThrow('Live-scene ACP implementation failed to load');
    expect(endTurn).toHaveBeenCalledOnce();
    expect(importClient.promptSession).not.toHaveBeenCalled();

    const connectGate = deferred<{ connection_id: string }>();
    const cancelClient = {
      connect: vi.fn(() => connectGate.promise),
      loadSession: vi.fn().mockResolvedValue({}),
      promptSession: vi.fn().mockResolvedValue({}),
      cancelSession: vi.fn().mockResolvedValue({}),
      events: vi.fn().mockResolvedValue({ notifications: [], disconnected: false }),
    };
    const cancelStore = new AstridAgentSessionStore(directStoreClient(cancelClient));
    const prompt = cancelStore.prompt('cancel-session', { message: 'stop before dispatch' }, context('cancel-project'));
    const cancellation = cancelStore.cancel('cancel-session');
    connectGate.resolve({ connection_id: 'cancel-connection' });
    await prompt;
    await cancellation;
    expect(cancelClient.loadSession).not.toHaveBeenCalled();
    expect(cancelClient.promptSession).not.toHaveBeenCalled();
    expect(cancelClient.cancelSession).toHaveBeenCalledExactlyOnceWith('cancel-connection', 'cancel-session');
    expect((await cancelStore.get('cancel-session')).status).toBe('waiting_user');
  });

  it('resolves pre-dispatch hook cancellation without retryable payload or local error', async () => {
    vi.resetModules();
    const { useCancelSession: isolatedCancelSession, useSendMessage: isolatedSendMessage } = await import('./useAgentSession.ts');
    const connectGate = deferred<{ connection_id: string }>();
    acp.connect.mockImplementationOnce(() => connectGate.promise as never);
    const { Wrapper } = createTestWrapper();
    const sessionId = 'project-chat-cancel-before-dispatch';
    const send = renderHook(() => isolatedSendMessage(sessionId, context('cancel-before-dispatch')), { wrapper: Wrapper });
    const cancel = renderHook(() => isolatedCancelSession(sessionId), { wrapper: Wrapper });
    let prompt!: Promise<unknown>;
    act(() => { prompt = send.result.current.mutateAsync({ message: 'stop before ACP dispatch' }); });
    await waitFor(() => expect(acp.connect).toHaveBeenCalledOnce());

    await act(async () => {
      const cancellation = cancel.result.current.mutateAsync();
      connectGate.resolve({ connection_id: 'cancel-before-dispatch-connection' });
      await Promise.all([prompt, cancellation]);
    });

    expect(acp.promptSession).not.toHaveBeenCalled();
    expect(acp.cancelSession).toHaveBeenCalledExactlyOnceWith('cancel-before-dispatch-connection', sessionId);
    expect(send.result.current.localError).toBeNull();
    expect(send.result.current.hasRetryableMessage).toBe(false);
    send.unmount();
    cancel.unmount();
    vi.resetModules();
  });
});
