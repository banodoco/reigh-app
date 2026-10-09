import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  appendAcpAssistantDraft,
  appendAcpTextTurn,
  extractReighElementOperations,
  isTimelineAgentSessionsAvailable,
  stripReighEditorContext,
  useCancelSession,
  useCreateSession,
  useSendMessage,
  useAgentSession,
} from './useAgentSession.ts';

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('timeline agent ACP chat', () => {
  it('advertises the local Astrid ACP implementation', () => {
    expect(isTimelineAgentSessionsAvailable()).toBe(true);
  });

  it('keeps missing identifiers as input errors before contacting ACP', async () => {
    const create = renderHook(() => useCreateSession(null), { wrapper });
    await expect(act(async () => create.result.current.mutateAsync(undefined))).rejects.toThrow('Select a project or timeline to start chatting.');
    create.unmount();

    const send = renderHook(() => useSendMessage(null, 'timeline-1'), { wrapper });
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
    const hook = renderHook(() => useAgentSession('saved-chat-retry'), { wrapper });
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
    expect(stripReighEditorContext('make the first clip start later\n\n<reigh_editor_context>\n{}\n</reigh_editor_context>'))
      .toBe('make the first clip start later');
    expect(stripReighEditorContext('<reigh_editor_context>\n{}\n</reigh_editor_context>')).toBe('');
    expect(stripReighEditorContext('make the first clip start later\n\nReigh editor context:\nTimeline ID: timeline-1'))
      .toBe('make the first clip start later');
  });

  it('extracts host-executable element operations without leaking markers into chat', () => {
    const result = extractReighElementOperations([
      'I will apply the effect.',
      '<reigh_element_operation>{"name":"elements.list"}</reigh_element_operation>',
      '<reigh_element_operation>{"name":"elements.validate","draft_id":"draft-glow"}</reigh_element_operation>',
    ].join('\n'));
    expect(result.visibleContent).toBe('I will apply the effect.');
    expect(result.operations).toEqual([
      { name: 'elements.list' },
      { name: 'elements.validate', draft_id: 'draft-glow' },
    ]);
    expect(result.parseErrors).toEqual([]);
  });

  it('reports malformed operation markers while preserving surrounding narration', () => {
    const result = extractReighElementOperations(
      'Done. <reigh_element_operation>{not json}</reigh_element_operation>',
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
