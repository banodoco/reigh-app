import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  appendAcpAssistantDraft,
  appendAcpTextTurn,
  AstridAgentSessionStore,
  extractAstridElementOperations,
  isTimelineAgentSessionsAvailable,
  projectChatQueryKey,
  stripAstridEditorContext,
  useCancelSession,
  useCreateSession,
  useProjectChat,
  useSaveProjectDraft,
  useSelectProjectSession,
  useSetMainProjectSession,
  useSendMessage,
  useAgentSession,
} from './useAgentSession.ts';
import type { ProjectChatState } from '@/integrations/astrid/acpRoutes.ts';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

function wrapperWithClient(client: QueryClient) {
  return function QueryClientWrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client }, children);
  };
}

afterEach(() => vi.restoreAllMocks());

describe('timeline agent ACP chat', () => {
  it('advertises the local Astrid ACP implementation', () => {
    expect(isTimelineAgentSessionsAvailable()).toBe(true);
  });

  it('keeps missing identifiers as input errors before contacting ACP', async () => {
    const create = renderHook(() => useCreateSession(null), { wrapper });
    await expect(act(async () => create.result.current.mutateAsync(undefined))).rejects.toThrow('Select a project or timeline to start chatting.');
    create.unmount();

    const send = renderHook(() => useSendMessage(null), { wrapper });
    await expect(act(async () => send.result.current.mutateAsync({ message: 'hello' }))).rejects.toThrow('sessionId is required');
    send.unmount();

    const cancel = renderHook(() => useCancelSession(null), { wrapper });
    await expect(act(async () => cancel.result.current.mutateAsync())).rejects.toThrow('sessionId is required');
  });

  it('stops saved-chat load polling after failure and lets an explicit retry restore the transcript', async () => {
    let loads = 0;
    let missing = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/chat')) return Response.json({project_id: 'saved-project', scope_key: 'project:saved-project', revision: 1, selected_session_id: 'saved-chat-retry', sessions: [{id: 'saved-chat-retry'}], draft: {text: '', revision: 1, queued_messages: []}});
      if (url.endsWith('/connect')) return Response.json({ connection_id: 'saved-chat-connection', initialize: {} });
      if (url.endsWith('/rpc')) {
        const body = JSON.parse(String(init?.body));
        expect(body.method).toBe('session/load');
        loads++;
        return missing
          ? Response.json({ error: 'acp_transport', detail: 'ACP request "session/load" failed: ACP session not found: saved-chat-retry' }, { status: 502 })
          : Response.json({ result: {} });
      }
      return Response.json({ disconnected: false, notifications: [{ jsonrpc: '2.0', method: 'session/update', params: {
        sessionId: 'saved-chat-retry', update: { sessionUpdate: 'agent_message_chunk', messageId: 'old-reply', content: { type: 'text', text: 'Persisted reply' } },
      } }] });
    }));
    const hook = renderHook(() => useAgentSession('saved-chat-retry', 'saved-project'), { wrapper });
    try {
      await waitFor(() => expect(hook.result.current.error?.message).toContain('ACP session not found'));
      vi.useFakeTimers();
      await act(async () => { await vi.advanceTimersByTimeAsync(2_500); });
      expect(loads).toBe(1);
      missing = false;
      await act(async () => { await hook.result.current.refetch(); await vi.advanceTimersByTimeAsync(10); });
      expect(loads).toBe(2);
      expect(hook.result.current.error).toBeNull();
      expect(hook.result.current.data?.turns).toEqual([expect.objectContaining({ role: 'assistant', content: 'Persisted reply' })]);
    } finally {
      hook.unmount();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('polls an idle session slowly and an active turn at the streaming cadence', async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const get = vi.spyOn(AstridAgentSessionStore.prototype, 'get').mockImplementation(async (_projectId, sessionId) => ({
      id: sessionId, status: sessionId === 'active-session' ? 'processing' : 'waiting_user', turns: [], taskLinks: [],
    } as never));
    client.setQueryData(['timeline-agent-session', 'idle-session', 'project-1'], {
      id: 'idle-session', status: 'waiting_user', turns: [], taskLinks: [],
    });
    const idle = renderHook(() => useAgentSession('idle-session', 'project-1'), { wrapper: wrapperWithClient(client) });
    try {
      await act(async () => { await Promise.resolve(); });
      const idleBaseline = get.mock.calls.length;
      expect(idleBaseline).toBeGreaterThan(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(14_999); });
      expect(get).toHaveBeenCalledTimes(idleBaseline);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(get).toHaveBeenCalledTimes(idleBaseline + 1);
      idle.unmount();

      client.setQueryData(['timeline-agent-session', 'active-session', 'project-1'], {
        id: 'active-session', status: 'processing', turns: [], taskLinks: [],
      });
      const active = renderHook(() => useAgentSession('active-session', 'project-1'), { wrapper: wrapperWithClient(client) });
      await act(async () => { await Promise.resolve(); });
      const activeBaseline = get.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(499); });
      expect(get).toHaveBeenCalledTimes(activeBaseline);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(get).toHaveBeenCalledTimes(activeBaseline + 1);
      active.unmount();
    } finally {
      idle.unmount();
      client.clear();
      vi.useRealTimers();
    }
  });

  it('polls project chat at the idle or active turn cadence', async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const projectChat = vi.spyOn(AstridAgentSessionStore.prototype, 'projectChat').mockImplementation(async (projectId) => ({
      project_id: projectId,
      revision: 1,
      draft: { revision: 1 },
    } as never));
    try {
      const idle = renderHook(() => useProjectChat('project-1'), { wrapper: wrapperWithClient(client) });
      await act(async () => { await Promise.resolve(); });
      const idleBaseline = projectChat.mock.calls.length;
      expect(idleBaseline).toBeGreaterThan(0);
      await act(async () => { await vi.advanceTimersByTimeAsync(14_999); });
      expect(projectChat).toHaveBeenCalledTimes(idleBaseline);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(projectChat).toHaveBeenCalledTimes(idleBaseline + 1);
      idle.unmount();

      client.setQueryData(['timeline-agent-session', 'active-session', 'project-1'], {
        id: 'active-session', status: 'processing', turns: [], taskLinks: [],
      });
      const active = renderHook(() => useProjectChat('project-1'), { wrapper: wrapperWithClient(client) });
      await act(async () => { await Promise.resolve(); });
      const activeBaseline = projectChat.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(499); });
      expect(projectChat).toHaveBeenCalledTimes(activeBaseline);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      expect(projectChat).toHaveBeenCalledTimes(activeBaseline + 1);
      active.unmount();
    } finally {
      client.clear();
      vi.useRealTimers();
    }
  });

  it('switches an idle session to fast polling as soon as a message is sent', async () => {
    vi.useFakeTimers();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const sessionKey = ['timeline-agent-session', 'send-session', 'project-1'] as const;
    let turnActive = false;
    const get = vi.spyOn(AstridAgentSessionStore.prototype, 'get').mockImplementation(async (_projectId, sessionId) => ({
      id: sessionId, status: turnActive ? 'processing' : 'waiting_user', turns: [], taskLinks: [],
    } as never));
    let finishPrompt!: () => void;
    const prompt = vi.spyOn(AstridAgentSessionStore.prototype, 'prompt').mockImplementation(async () => {
      turnActive = true;
      await new Promise<void>(resolve => { finishPrompt = resolve; });
    });
    client.setQueryData(sessionKey, { id: 'send-session', status: 'waiting_user', turns: [], taskLinks: [] });
    const hook = renderHook(() => ({
      session: useAgentSession('send-session', 'project-1'),
      send: useSendMessage('send-session', { tool: 'video-editor', projectId: 'project-1', projectSlug: null, timelineId: null, timelineName: null }, 'project-1'),
    }), { wrapper: wrapperWithClient(client) });
    try {
      await act(async () => { await Promise.resolve(); });
      const baseline = get.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
      expect(get).toHaveBeenCalledTimes(baseline);
      let sending!: Promise<unknown>;
      act(() => { sending = hook.result.current.send.mutateAsync({ message: 'hello' }); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(prompt).toHaveBeenCalled();
      expect(client.getQueryData(sessionKey)).toMatchObject({ status: 'processing' });
      const afterSend = get.mock.calls.length;
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(get).toHaveBeenCalledTimes(afterSend + 1);
      await act(async () => { finishPrompt(); await sending; });
    } finally {
      hook.unmount();
      client.clear();
      vi.useRealTimers();
    }
  });

  it('restores project chat reads and writes through the existing ACP routes', async () => {
    const chat = {
      project_id: 'project-1',
      scope_key: 'project:project-1',
      revision: 4,
      selected_session_id: 'session-1',
      sessions: [{ id: 'session-1' }],
      draft: { text: 'draft', revision: 2, queued_messages: [] },
    };
    const acp = {
      projectChat: vi.fn(async () => chat),
      saveProjectDraft: vi.fn(async () => chat),
      selectProjectSession: vi.fn(async () => chat),
    };
    const store = new AstridAgentSessionStore({ acp } as never);

    await expect(store.projectChat('project-1')).resolves.toBe(chat);
    await expect(store.saveProjectDraft('project-1', 2, 'new draft', [])).resolves.toBe(chat);
    await expect(store.selectProjectSession('project-1', 4, null)).resolves.toBe(chat);
    expect(acp.projectChat).toHaveBeenCalledWith('project-1');
    expect(acp.saveProjectDraft).toHaveBeenCalledWith('project-1', 2, 'new draft', []);
    expect(acp.selectProjectSession).toHaveBeenCalledWith('project-1', 4, null);
  });

  it('keeps chat association order stable when selected and Main pointers change', async () => {
    const chat = { selected_session_id: 'second', main_session_id: 'second', sessions: [{ id: 'first' }, { id: 'second' }] };
    const acp = {
      projectChat: vi.fn(async () => chat),
      connect: vi.fn(async () => ({ connection_id: 'connection' })),
      events: vi.fn(async () => ({ notifications: [], disconnected: false })),
    };
    const store = new AstridAgentSessionStore({ acp } as never);
    expect((await store.list('project')).map(s => s.id)).toEqual(['first', 'second']);
    chat.selected_session_id = 'first';
    expect((await store.list('project')).map(s => s.id)).toEqual(['first', 'second']);
  });

  it('assigns Main through the existing revisioned project chat cache', async () => {
    const chat = {project_id: 'project-1', revision: 5, main_session_id: 'chosen', selected_session_id: 'chosen'} as ProjectChatState;
    const assign = vi.spyOn(AstridAgentSessionStore.prototype, 'setMainProjectSession').mockResolvedValue(chat);
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const {result, unmount} = renderHook(() => useSetMainProjectSession('project-1'), {wrapper: wrapperWithClient(client)});
    await act(async () => result.current.mutateAsync({expectedRevision: 4, sessionId: 'chosen'}));
    expect(assign).toHaveBeenCalledWith('project-1', 4, 'chosen');
    expect(client.getQueryData(projectChatQueryKey('project-1'))).toEqual(chat);
    unmount();
    client.clear();
  });

  it('loads project chat through the query hook and uses the project-scoped cache key', async () => {
    const chat = {project_id: 'project-1', revision: 4} as ProjectChatState;
    const projectChat = vi.spyOn(AstridAgentSessionStore.prototype, 'projectChat').mockResolvedValue(chat);
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const {result, unmount} = renderHook(() => useProjectChat('project-1'), {wrapper: wrapperWithClient(client)});

    await waitFor(() => expect(result.current.data).toBe(chat));
    expect(projectChat).toHaveBeenCalledWith('project-1');
    expect(client.getQueryData(projectChatQueryKey('project-1'))).toBe(chat);
    unmount();
    client.clear();
  });

  it('saves project drafts through the mutation hook and refreshes the scoped chat cache', async () => {
    const chat = {project_id: 'project-1', revision: 5} as ProjectChatState;
    const saveProjectDraft = vi.spyOn(AstridAgentSessionStore.prototype, 'saveProjectDraft').mockResolvedValue(chat);
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const {result, unmount} = renderHook(() => useSaveProjectDraft('project-1'), {wrapper: wrapperWithClient(client)});

    await act(async () => result.current.mutateAsync({expectedRevision: 4, text: 'draft update', queuedMessages: []}));
    expect(saveProjectDraft).toHaveBeenCalledWith('project-1', 4, 'draft update', []);
    expect(client.getQueryData(projectChatQueryKey('project-1'))).toBe(chat);
    unmount();
    client.clear();
  });

  it('selects a project session through the mutation hook and refreshes the scoped chat cache', async () => {
    const chat = {project_id: 'project-1', revision: 5} as ProjectChatState;
    const selectProjectSession = vi.spyOn(AstridAgentSessionStore.prototype, 'selectProjectSession').mockResolvedValue(chat);
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const {result, unmount} = renderHook(() => useSelectProjectSession('project-1'), {wrapper: wrapperWithClient(client)});

    await act(async () => result.current.mutateAsync({expectedRevision: 4, sessionId: 'session-2'}));
    expect(selectProjectSession).toHaveBeenCalledWith('project-1', 4, 'session-2');
    expect(client.getQueryData(projectChatQueryKey('project-1'))).toBe(chat);
    unmount();
    client.clear();
  });

  it('preserves ACP message boundaries when adjacent replies arrive', () => {
    const turns = [] as Parameters<typeof appendAcpTextTurn>[0];
    appendAcpTextTurn(turns, 'user', 'first', '2026-09-18T15:00:00.000Z', 'user-1');
    appendAcpTextTurn(turns, 'assistant', 'one', '2026-09-18T15:00:01.000Z', 'assistant-1');
    appendAcpTextTurn(turns, 'assistant', ' plus', '2026-09-18T15:00:01.100Z', 'assistant-1');
    appendAcpTextTurn(turns, 'user', 'second', '2026-09-18T15:00:02.000Z', 'user-2');
    appendAcpTextTurn(turns, 'assistant', 'two', '2026-09-18T15:00:03.000Z', 'assistant-2');

    expect(turns.map(({ role, content }) => ({ role, content }))).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'one plus' },
      { role: 'user', content: 'second' },
      { role: 'assistant', content: 'two' },
    ]);
  });

  it('keeps streamed assistant narration transient and starts a new final candidate at a new message boundary', () => {
    const preamble = appendAcpAssistantDraft(undefined, 'Checking the timeline…', 'assistant-1');
    expect(appendAcpAssistantDraft(preamble, ' reading the compact summary', 'assistant-1')).toEqual({
      content: 'Checking the timeline… reading the compact summary',
      messageId: 'assistant-1',
    });

    expect(appendAcpAssistantDraft(preamble, 'Done — moved the clip.', 'assistant-2')).toEqual({
      content: 'Done — moved the clip.',
      messageId: 'assistant-2',
    });
  });

  it('hides the model-only editor context from the rendered transcript', () => {
    expect(stripAstridEditorContext('make the first clip start later\n\n<astrid_editor_context>\n{}\n</astrid_editor_context>'))
      .toBe('make the first clip start later');
    expect(stripAstridEditorContext('<astrid_editor_context>\n{}\n</astrid_editor_context>')).toBe('');
    expect(stripAstridEditorContext('make the first clip start later\n\nAstrid editor context:\nTimeline ID: timeline-1'))
      .toBe('make the first clip start later');
  });

  it('extracts host-executable element operations without leaking markers into chat', () => {
    const result = extractAstridElementOperations([
      'I will apply the effect.',
      '<astrid_element_operation>{"name":"elements.list"}</astrid_element_operation>',
      '<astrid_element_operation>{"name":"elements.validate","draft_id":"draft-glow"}</astrid_element_operation>',
    ].join('\n'));
    expect(result.visibleContent).toBe('I will apply the effect.');
    expect(result.operations).toEqual([
      { name: 'elements.list' },
      { name: 'elements.validate', draft_id: 'draft-glow' },
    ]);
    expect(result.parseErrors).toEqual([]);
  });

  it('reports malformed operation markers while preserving surrounding narration', () => {
    const result = extractAstridElementOperations(
      'Done. <astrid_element_operation>{not json}</astrid_element_operation>',
    );
    expect(result.visibleContent).toBe('Done.');
    expect(result.operations).toEqual([]);
    expect(result.parseErrors).toHaveLength(1);
  });
});


describe('explicit third-argument project routing', () => {
  const context = (projectId: string, timelineId: string | null = null) => ({
    tool: 'video-editor' as const, projectId, projectSlug: `${projectId}-slug`, timelineId, timelineName: timelineId,
  });

  it('keeps a failed request on its captured route/context and rejects a later project even if the session ID is unchanged', async () => {
    vi.resetModules();
    const { useSendMessage: scopedSend } = await import('./useAgentSession.ts');
    const prompts: Array<{ url: string; body: { session_id: string; prompt: Array<{ text: string }> } }> = [];
    let fail = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/chat')) return Response.json({project_id: url.includes('route-a') ? 'route-a' : 'route-b', scope_key: 'project:route', revision: 1, selected_session_id: 'same-session', sessions: [{id: 'same-session'}], draft: {text: '', revision: 1, queued_messages: []}});
      if (url.endsWith('/connect')) return Response.json({ connection_id: 'route-connection', initialize: {} });
      if (url.endsWith('/rpc')) {
        expect(JSON.parse(String(init?.body)).method).toBe('session/load');
        return Response.json({ result: {} });
      }
      if (url.endsWith('/chat/prompt')) {
        prompts.push({ url, body: JSON.parse(String(init?.body)) });
        return fail ? Response.json({ error: 'acp_transport', detail: 'reply lost' }, { status: 502 }) : Response.json({ result: {} });
      }
      return Response.json({ disconnected: false, notifications: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const hook = renderHook(({ scope, route }) => scopedSend('same-session', scope, route), {
      wrapper, initialProps: { scope: context('route-a', 'timeline-original'), route: 'route-a' },
    });
    try {
      await expect(act(async () => { await hook.result.current.mutateAsync({ message: 'captured message' }); })).rejects.toThrow('reply lost');
      expect(prompts).toHaveLength(1);
      expect(prompts[0].url).toContain('/projects/route-a/chat/prompt');
      expect(prompts[0].body.session_id).toBe('same-session');
      const captured = prompts[0].body.prompt[1].text;
      expect(captured).toContain('timeline-original');
      // Changing the route and scope while keeping the same opaque session must
      // not dispatch the old payload to the new project.
      hook.rerender({ scope: context('route-b', 'timeline-new'), route: 'route-b' });
      const callsBeforeRetry = fetchMock.mock.calls.length;
      await expect(act(async () => { await hook.result.current.retryLastMessage(); })).rejects.toThrow('original project');
      expect(fetchMock).toHaveBeenCalledTimes(callsBeforeRetry);
      expect(prompts).toHaveLength(1);
      // Returning to the original project permits retry while retaining the
      // original captured timeline, even though the current timeline changed.
      fail = false;
      hook.rerender({ scope: context('route-a', 'timeline-current'), route: 'route-a' });
      await act(async () => { await hook.result.current.retryLastMessage(); });
      expect(prompts).toHaveLength(2);
      expect(prompts[1].url).toBe(prompts[0].url);
      expect(prompts[1].body.session_id).toBe('same-session');
      expect(prompts[1].body.prompt[0].text).toBe('captured message');
      expect(prompts[1].body.prompt[1].text).toContain('timeline-original');
      expect(prompts[1].body.prompt[1].text).not.toContain('timeline-current');
      expect(hook.result.current.hasRetryableMessage).toBe(false);
    } finally {
      hook.unmount(); vi.unstubAllGlobals(); vi.resetModules();
    }
  });

  it('rejects a mixed project route/context before any ACP dispatch', async () => {
    vi.resetModules();
    const { useSendMessage: scopedSend } = await import('./useAgentSession.ts');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const hook = renderHook(() => scopedSend('mixed-session', context('context-a'), 'route-b'), { wrapper });
    try {
      await expect(act(async () => { await hook.result.current.mutateAsync({ message: 'never forward' }); })).rejects.toThrow('routing project does not match');
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      hook.unmount(); vi.unstubAllGlobals(); vi.resetModules();
    }
  });
});


describe('scoped project membership and independent revision receipts', () => {
  it('refuses a missing or foreign project session before connection, load or prompt', async () => {
    const acp = {
      projectChat: vi.fn(async () => ({sessions: [{id: 'missing-session', missing: true}]})),
      connect: vi.fn(), loadSession: vi.fn(), promptProjectSession: vi.fn(),
    };
    const store = new AstridAgentSessionStore({acp} as never);
    await expect(store.get('project-a', 'foreign-session')).rejects.toThrow('does not belong');
    await expect(store.prompt('missing-session', {message: 'never dispatch'}, {
      tool: 'video-editor', projectId: 'project-a', projectSlug: null, timelineId: null, timelineName: null,
    })).rejects.toThrow('does not belong');
    expect(acp.connect).not.toHaveBeenCalled();
    expect(acp.loadSession).not.toHaveBeenCalled();
    expect(acp.promptProjectSession).not.toHaveBeenCalled();
  });

  it('keeps a late draft receipt in its captured project and preserves a newer session selection', async () => {
    const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
    const newer = {project_id: 'old-project', revision: 8, selected_session_id: 'new-selection', sessions: [],
      draft: {revision: 2, text: 'previous', queued_messages: []}} as ProjectChatState;
    client.setQueryData(projectChatQueryKey('old-project'), newer);
    let resolve!: (value: ProjectChatState) => void;
    vi.spyOn(AstridAgentSessionStore.prototype, 'saveProjectDraft').mockImplementation(() => new Promise(done => { resolve = done; }));
    const hook = renderHook(({project}) => useSaveProjectDraft(project), {wrapper: wrapperWithClient(client), initialProps: {project: 'old-project'}});
    let pending!: Promise<ProjectChatState>;
    act(() => { pending = hook.result.current.mutateAsync({expectedRevision: 2, text: 'captured draft', queuedMessages: []}); });
    await waitFor(() => expect(resolve).toBeTypeOf('function'));
    hook.rerender({project: 'new-project'});
    await act(async () => {
      resolve({...newer, revision: 7, selected_session_id: 'obsolete-selection', draft: {revision: 3, text: 'captured draft', queued_messages: []}});
      await pending;
    });
    expect(client.getQueryData(projectChatQueryKey('old-project'))).toMatchObject({revision: 8, selected_session_id: 'new-selection', draft: {revision: 3, text: 'captured draft'}});
    expect(client.getQueryData(projectChatQueryKey('new-project'))).toBeUndefined();
    hook.unmount(); client.clear();
  });
});
