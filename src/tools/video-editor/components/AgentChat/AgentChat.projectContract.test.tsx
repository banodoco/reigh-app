// @vitest-environment jsdom
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentChatEditorContext } from '@/shared/contexts/AgentChatContext';
import type { ProjectChatState } from '@/integrations/astrid/acpRoutes';

// The editor is the host boundary. Chat, its hooks, ACP routes, transport,
// presentation, attachment selection and query cache are all real.
const host = vi.hoisted(() => ({ context: null as AgentChatEditorContext | null,
  actions: { registerHandlers: vi.fn(), publishState: vi.fn(), unregister: vi.fn() } }));
vi.mock('@/shared/contexts/AgentChatContext', () => ({
  useAgentChatBridge: () => ({ editorContext: host.context, timelineId: host.context?.timelineId }),
  useAgentChatActionsRegistry: () => host.actions,
}));

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function context(projectId: string): AgentChatEditorContext {
  return { tool: 'video-editor', projectId, projectSlug: `slug-${projectId}`,
    timelineId: `timeline-${projectId}`, timelineName: `Timeline ${projectId}`,
    timelineSummary: { configVersion: 7, trackCount: 2, clipCount: 3, assetCount: 1, duration: 12 } };
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
class HostTransport {
  readonly calls: Array<{ route: string; body: Record<string, any> }> = [];
  readonly chats = new Map<string, ProjectChatState>();
  readonly transcripts = new Map<string, Array<{ role: 'user' | 'assistant'; text: string }>>();
  readonly events: unknown[] = [];
  connectFailure: Error | null = null;
  loadFailure: Error | null = null;
  promptFailure: Error | null = null;
  disconnected = false;
  onPrompt: (() => Promise<void>) | null = null;
  onLoad: (() => Promise<void>) | null = null;
  assistant = 'Done.';
  private sequence = 0;
  chat(project: string) {
    if (!this.chats.has(project)) this.chats.set(project, { project_id: project, scope_key: `realm:${project}`,
      revision: 0, selected_session_id: null, sessions: [], draft: { text: '', revision: 0, queued_messages: [] } });
    return this.chats.get(project)!;
  }
  seed(project: string, id = `session-${project}`) {
    const chat = this.chat(project);
    chat.sessions.push({ id }); chat.selected_session_id = id;
    this.transcripts.set(id, []);
    return id;
  }
  event(id: string, role: 'user' | 'assistant', text: string, index: number) {
    this.events.push({ params: { sessionId: id, update: { sessionUpdate: role === 'user' ? 'user_message_chunk' : 'agent_message_chunk',
      messageId: `${id}-${role}-${index}`, content: { type: 'text', text } } } });
  }
  fetch = async (url: string | URL | Request, init?: RequestInit) => {
    const route = String(url).replace('/api/astrid', '');
    const body = JSON.parse(String(init?.body ?? '{}'));
    this.calls.push({ route, body });
    if (route === '/acp/connect') {
      if (this.connectFailure) throw this.connectFailure;
      return response({ connection_id: 'connection-1', initialize: {} });
    }
    if (route.endsWith('/events')) {
      const disconnected = this.disconnected; this.disconnected = false;
      return response({ notifications: this.events.splice(0), disconnected });
    }
    if (route.endsWith('/cancel')) return response({ cancelled: true, session_id: body.sessionId });
    if (route.endsWith('/rpc')) {
      // The project panel may load a transcript, but must never create, list or
      // prompt through the global compatibility RPC.
      expect(body.method).toBe('session/load');
      if (this.onLoad) await this.onLoad();
      if (this.loadFailure) throw this.loadFailure;
      for (const [index, turn] of (this.transcripts.get(body.params.sessionId) ?? []).entries()) {
        this.event(body.params.sessionId, turn.role, turn.text, index);
      }
      return response({ result: {} });
    }
    const match = route.match(/^\/acp\/projects\/([^/]+)\/chat(?:\/(\w+))?$/);
    if (!match) throw new Error(`Unexpected transport route: ${route}`);
    const [, project, action] = match;
    const chat = this.chat(project);
    if (action === 'sessions') {
      expect(body.operation_id).toEqual(expect.any(String));
      expect(body.operation_id.length).toBeGreaterThan(0);
      if (body.mode === 'new' || !chat.selected_session_id) {
        const id = `session-${project}-${++this.sequence}`;
        this.seed(project, id); chat.revision++;
      }
      return response({ ...chat, operation_session_id: chat.selected_session_id });
    }
    if (action === 'draft') {
      if (body.expected_revision !== chat.draft.revision) return response({ error: 'draft_conflict', detail: 'Draft changed' }, 409);
      chat.draft = { text: body.text, revision: chat.draft.revision + 1, queued_messages: body.queued_messages };
      return response(chat);
    }
    if (action === 'prompt') {
      if (!chat.sessions.some(s => s.id === body.session_id)) return response({ error: 'session_not_owned', detail: 'Unowned session' }, 403);
      const assistantReply = this.assistant;
      if (this.onPrompt) await this.onPrompt();
      if (this.promptFailure) throw this.promptFailure;
      const transcript = this.transcripts.get(body.session_id)!;
      transcript.push({ role: 'user', text: body.prompt[0].text }, { role: 'assistant', text: assistantReply });
      // ACP commonly does not echo the live user turn. Replay happens on load.
      this.event(body.session_id, 'assistant', assistantReply, transcript.length);
      return response({ result: { stopReason: 'end_turn' } });
    }
    return response(chat);
  };
}
let fixture: HostTransport;
let clients: QueryClient[] = [];
let Panel: typeof import('./AgentChat')['AgentChatPanel'];
async function freshModules() {
  vi.resetModules();
  Panel = (await import('./AgentChat')).AgentChatPanel;
  const { usePanesStoreApi } = await import('@/shared/state/panesStore');
  usePanesStoreApi().setState({ isTasksPaneLocked: true });
}
function mount(strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const panel = <QueryClientProvider client={client}><Panel /></QueryClientProvider>;
  return render(strict ? <React.StrictMode>{panel}</React.StrictMode> : panel);
}
async function send(text: string) {
  const input = await screen.findByRole('textbox');
  await waitFor(() => expect(input).not.toBeDisabled());
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByTitle('Send'));
}
beforeEach(async () => {
  fixture = new HostTransport();
  host.context = context('p1');
  vi.stubGlobal('fetch', fixture.fetch);
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
  await freshModules();
});
afterEach(async () => {
  cleanup();
  await act(async () => { await Promise.resolve(); });
  for (const client of clients) client.clear();
  clients = [];
  vi.unstubAllGlobals();
});

describe('real panel → real hooks → owned ACP transport', () => {
  it('sends ensure/new operation ids, exact text and captured context/attachments through project routes; reopens durable history in a fresh store', async () => {
    const view = mount();
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    const ensure = fixture.calls.find(c => c.route.endsWith('/sessions'))!;
    expect(ensure).toMatchObject({ route: '/acp/projects/p1/chat/sessions', body: { mode: 'ensure', connection_id: 'connection-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'New', exact: true }));
    await waitFor(() => expect(fixture.calls.filter(c => c.route.endsWith('/sessions'))).toHaveLength(2));
    await waitFor(() => expect(fixture.calls.some(c => c.body.params?.sessionId === fixture.chat('p1').selected_session_id)).toBe(true));
    expect(fixture.calls.filter(c => c.route.endsWith('/sessions'))[1].body).toMatchObject({ mode: 'new', operation_id: expect.any(String) });
    const { setTimelineClipData, editorReplaceTimelineSelection } = await import('@/shared/state/selectionStore');
    act(() => {
      setTimelineClipData([{ clipId: 'clip-1', assetKey: 'asset-1', url: 'https://example.test/image.png', mediaType: 'image', isTimelineBacked: true, trackId: 'track', at: 2, duration: 3 }]);
      editorReplaceTimelineSelection(['clip-1']);
    });
    await send('Change only the cube color to teal.');
    await screen.findByText('Done.');
    await waitFor(() => expect(screen.queryByText('Thinking...')).not.toBeInTheDocument());
    const prompt = fixture.calls.filter(c => c.route.endsWith('/prompt'));
    expect(prompt).toHaveLength(1);
    expect(prompt[0]).toMatchObject({ route: '/acp/projects/p1/chat/prompt', body: {
      connection_id: 'connection-1', session_id: fixture.chat('p1').selected_session_id,
      prompt: [{ type: 'text', text: 'Change only the cube color to teal.' }, { type: 'text', text: expect.any(String) }],
    } });
    const captured = JSON.parse(prompt[0].body.prompt[1].text.replace('<reigh_editor_context>', '').replace('</reigh_editor_context>', ''));
    expect(captured).toMatchObject({ project: { id: 'p1' }, timeline: { id: 'timeline-p1', summary: { config_version: 7 } },
      selection: { clip_ids: ['clip-1'], assets: [{ clip_id: 'clip-1', track_id: 'track', at: 2, duration: 3 }] } });
    expect(fixture.calls.findIndex(c => c.route.endsWith('/draft'))).toBeLessThan(fixture.calls.findIndex(c => c.route.endsWith('/prompt')));
    await waitFor(() => expect(fixture.chat('p1').draft.queued_messages).toEqual([]));
    view.unmount();
    await act(async () => { await Promise.resolve(); });
    await freshModules(); // new tab-local store, fresh connection and query cache
    mount();
    await screen.findByText('Change only the cube color to teal.');
    await screen.findByText('Done.');
    expect(fixture.calls.filter(c => c.route === '/acp/connect')).toHaveLength(2);
    expect(fixture.calls.filter(c => c.route.endsWith('/prompt'))).toHaveLength(1);
    expect(fixture.chat('p1').sessions).toHaveLength(2);
  });

  it('can submit after development StrictMode replays mount effects', async () => {
    fixture.seed('p1');
    mount(true);
    await send('StrictMode scene instruction');
    await screen.findByText('Done.');
    expect(fixture.calls.filter(c => c.route.endsWith('/prompt'))).toHaveLength(1);
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
  });

  it.each(['rejection', 'timeout', 'disconnect'] as const)('settles terminal %s with visible recovery and persisted user text', async failure => {
    fixture.seed('p1');
    mount();
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    if (failure === 'rejection') fixture.promptFailure = new Error('Prompt rejected');
    if (failure === 'timeout') fixture.promptFailure = new DOMException('Deadline elapsed', 'TimeoutError');
    if (failure === 'disconnect') fixture.onPrompt = async () => { fixture.disconnected = true; };
    await send(`Retain ${failure} text`);
    await screen.findByRole('alert');
    await waitFor(() => expect(screen.queryByText('Thinking...')).not.toBeInTheDocument());
    expect(fixture.chat('p1').draft.queued_messages).toEqual([expect.objectContaining({ text: `Retain ${failure} text` })]);
    expect(screen.getByRole('button', { name: 'Retry saved message' })).toBeInTheDocument();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    expect(fixture.calls.filter(c => c.route.endsWith('/prompt'))).toHaveLength(1);
  });

  it('shows recoverable initialization failure without automatically issuing another creation operation', async () => {
    fixture.connectFailure = new Error('Initialize failed');
    fixture.chat('p1').draft.text = 'Keep initialization text';
    mount();
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox')).toHaveValue('Keep initialization text');
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 550)); });
    expect(fixture.calls.filter(c => c.route === '/acp/connect')).toHaveLength(1);
    fixture.connectFailure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }));
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    expect(fixture.calls.filter(c => c.route.endsWith('/sessions'))).toHaveLength(1);
  });

  it('preserves a saved draft when transcript load fails, then recovers through Retry', async () => {
    fixture.seed('p1'); fixture.chat('p1').draft.text = 'Unsent scene edit';
    fixture.loadFailure = new Error('Load failed');
    mount();
    await screen.findByRole('alert');
    expect(screen.getByRole('textbox')).toHaveValue('Unsent scene edit');
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
    fixture.loadFailure = null;
    fireEvent.click(screen.getByRole('button', { name: 'Retry', exact: true }));
    await send('Recovered edit');
    await screen.findByText('Done.');
  });

  it('does not send after old-project preflight completes in a newly selected project', async () => {
    fixture.seed('p1'); fixture.seed('p2');
    const view = mount();
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    // Delay ownership lookup at the submission boundary, after normal hydration.
    const originalFetch = fixture.fetch;
    const gate = deferred();
    let blocked = false;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      if (!blocked && url.endsWith('/projects/p1/chat') && (!init?.method || init.method === 'GET')) {
        blocked = true; await gate.promise;
      }
      return originalFetch(url, init);
    });
    await send('Old project instruction');
    await waitFor(() => expect(blocked).toBe(true));
    host.context = context('p2');
    view.rerender(<QueryClientProvider client={clients[0]}><Panel /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    await act(async () => { gate.resolve(); });
    expect(fixture.calls.filter(c => c.route.endsWith('/prompt'))).toHaveLength(0);
    expect(screen.queryByText('Old project instruction')).not.toBeInTheDocument();
    expect(fixture.chat('p1').draft.queued_messages).toEqual([expect.objectContaining({ text: 'Old project instruction' })]);
    await send('New project instruction');
    await screen.findByText('Done.');
    expect(fixture.calls.filter(c => c.route.endsWith('/prompt'))[0].route).toBe('/acp/projects/p2/chat/prompt');
  });

  it('ignores a delayed old-project operation response instead of publishing through either host adapter', async () => {
    fixture.seed('p1'); fixture.seed('p2');
    const oldAdapter = { execute: vi.fn() };
    const newAdapter = { execute: vi.fn() };
    host.context = { ...context('p1'), elementOperationAdapter: oldAdapter as never };
    const gate = deferred(); fixture.onPrompt = () => gate.promise;
    fixture.assistant = '<reigh_element_operation>{"name":"elements.list"}</reigh_element_operation>';
    const view = mount();
    await send('Old operation');
    await waitFor(() => expect(fixture.calls.some(c => c.route.endsWith('/prompt'))).toBe(true));
    host.context = { ...context('p2'), elementOperationAdapter: newAdapter as never };
    view.rerender(<QueryClientProvider client={clients[0]}><Panel /></QueryClientProvider>);
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    await act(async () => { gate.resolve(); });
    expect(oldAdapter.execute).not.toHaveBeenCalled();
    expect(newAdapter.execute).not.toHaveBeenCalled();
    expect(screen.queryByText('Old operation')).not.toBeInTheDocument();
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
  });

  it('keeps New selected when an older draft reply arrives late', async () => {
    fixture.seed('p1');
    const view = mount();
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    const gate = deferred(); let delayed = false;
    const originalFetch = fixture.fetch;
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const reply = await originalFetch(url, init);
      if (!delayed && url.endsWith('/draft')) { delayed = true; await gate.promise; }
      return reply;
    });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Draft for the new conversation' } });
    await waitFor(() => expect(delayed).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'New', exact: true }));
    await waitFor(() => expect(fixture.chat('p1').selected_session_id).not.toBe('session-p1'));
    const newId = fixture.chat('p1').selected_session_id;
    await waitFor(() => expect(fixture.calls.some(c => c.body.params?.sessionId === newId)).toBe(true));
    await act(async () => { gate.resolve(); });
    await send('Use the new session');
    await screen.findByText('Done.');
    expect(fixture.calls.filter(c => c.route.endsWith('/prompt'))).toEqual([
      expect.objectContaining({ body: expect.objectContaining({ session_id: newId }) }),
    ]);
    view.unmount();
  });

  it('retires a pending operation when New changes sessions within the same project', async () => {
    fixture.seed('p1');
    const execute = vi.fn();
    host.context = { ...context('p1'), elementOperationAdapter: { execute } as never };
    const gate = deferred(); fixture.onPrompt = () => gate.promise;
    fixture.assistant = '<reigh_element_operation>{"name":"elements.list"}</reigh_element_operation>';
    mount();
    await send('Old session operation');
    await waitFor(() => expect(fixture.calls.some(c => c.route.endsWith('/prompt'))).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'New', exact: true }));
    await waitFor(() => expect(fixture.chat('p1').selected_session_id).not.toBe('session-p1'));
    const newId = fixture.chat('p1').selected_session_id;
    await waitFor(() => expect(fixture.calls.some(c => c.body.params?.sessionId === newId)).toBe(true));
    await waitFor(() => expect(screen.queryByText('Thinking...')).not.toBeInTheDocument());
    fixture.onPrompt = null; fixture.assistant = 'New session completed.';
    await send('New session instruction');
    await screen.findByText('New session completed.');
    expect(fixture.calls.filter(c => c.route.endsWith('/prompt'))).toHaveLength(2);
    await act(async () => { gate.resolve(); });
    expect(execute).not.toHaveBeenCalled();
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
  });

  it('retains failed submission text after a fresh store reload and pauses it until explicit retry', async () => {
    fixture.seed('p1'); fixture.promptFailure = new Error('Lost reply');
    const view = mount();
    await send('Recover this unsent instruction');
    await screen.findByRole('alert');
    view.unmount();
    await act(async () => { await Promise.resolve(); });
    fixture.promptFailure = null;
    await freshModules();
    mount();
    await screen.findByRole('button', { name: 'Retry saved message' });
    await waitFor(() => expect(screen.getByRole('textbox')).not.toBeDisabled());
    expect(screen.getByText('Recover this unsent instruction')).toBeInTheDocument();
    expect(fixture.calls.filter(c => c.route.endsWith('/prompt'))).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry saved message' }));
    await screen.findByText('Done.');
    expect(fixture.calls.filter(c => c.route.endsWith('/prompt'))).toHaveLength(2);
  });

  it('rejects an unowned session before load or prompt execution', async () => {
    fixture.seed('p1');
    const { AstridAgentSessionStore } = await import('../../hooks/useAgentSession');
    const store = new AstridAgentSessionStore();
    await expect(store.prompt('session-foreign', { message: 'Do not execute' }, context('p1'))).rejects.toThrow('does not belong');
    expect(fixture.calls.filter(c => c.route.endsWith('/rpc') || c.route.endsWith('/prompt') || c.route === '/acp/connect')).toEqual([]);
  });
});
