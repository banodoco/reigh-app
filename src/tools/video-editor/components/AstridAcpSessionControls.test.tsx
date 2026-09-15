import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AstridAcpSessionControls } from './AstridAcpSessionControls.tsx';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type Call = { path: string; method: string; body?: unknown };

function requestCall(input: RequestInfo | URL, init?: RequestInit): Call {
  const url = new URL(input instanceof Request ? input.url : String(input), 'http://bridge.test');
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined;
  return { path: url.pathname, method: init?.method ?? 'GET', ...(body !== undefined ? { body } : {}) };
}

describe('AstridAcpSessionControls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drives connect/create/exact resume/cancel/close and reconnect without persisting IDs', async () => {
    const calls: Array<{ path: string; method: string; body?: unknown }> = [];
    let connectionNumber = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), 'http://bridge.test');
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as unknown : undefined;
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', ...(body !== undefined ? { body } : {}) });
      if (url.pathname === '/api/astrid/acp/connect') {
        connectionNumber += 1;
        return jsonResponse({ connection_id: `connection-${connectionNumber}`, initialize: {} });
      }
      if (url.pathname === '/api/astrid/acp/connection-1/reconnect') {
        return jsonResponse({ connection_id: 'connection-1', reused: true });
      }
      if (url.pathname.endsWith('/cancel')) {
        return jsonResponse({ cancelled: true, session_id: 'session-1' });
      }
      if (url.pathname.endsWith('/rpc')) {
        const method = (body as { method?: string }).method;
        if (method === 'session/list') return jsonResponse({ result: { sessions: [{ sessionId: 'session-1' }] } });
        if (method === 'session/new' || method === 'session/resume') {
          return jsonResponse({ result: { sessionId: 'session-1' } });
        }
        if (method === 'session/close') return jsonResponse({ result: {} });
      }
      if (url.pathname.startsWith('/api/astrid/acp/')) {
        return jsonResponse({ connection_id: 'connection-1', closed: true });
      }
      throw new Error(`unexpected ${url.pathname}`);
    }));

    render(<AstridAcpSessionControls enabled />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('astrid-acp-connect'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connected; select a session'));
    await user.click(screen.getByTestId('astrid-acp-create'));
    await waitFor(() => expect(screen.getByDisplayValue('session-1')).toBeInTheDocument());

    await user.click(screen.getByTestId('astrid-acp-connect'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Reconnected; select a session'));
    await user.selectOptions(screen.getByLabelText('Astrid ACP session ID'), 'session-1');
    await user.click(screen.getByTestId('astrid-acp-resume'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Session resumed'));
    await user.click(screen.getByTestId('astrid-acp-cancel'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Session cancellation requested'));
    await user.click(screen.getByTestId('astrid-acp-close'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Disconnected'));

    expect(calls).toEqual([
      { path: '/api/astrid/acp/connect', method: 'POST', body: {} },
      { path: '/api/astrid/acp/connection-1/rpc', method: 'POST', body: { method: 'session/list', params: {} } },
      { path: '/api/astrid/acp/connection-1/rpc', method: 'POST', body: { method: 'session/new', params: { mcpServers: [] } } },
      { path: '/api/astrid/acp/connection-1/reconnect', method: 'POST', body: {} },
      { path: '/api/astrid/acp/connection-1/rpc', method: 'POST', body: { method: 'session/list', params: {} } },
      { path: '/api/astrid/acp/connection-1/rpc', method: 'POST', body: { method: 'session/resume', params: { sessionId: 'session-1' } } },
      { path: '/api/astrid/acp/connection-1/cancel', method: 'POST', body: { sessionId: 'session-1' } },
      { path: '/api/astrid/acp/connection-1/rpc', method: 'POST', body: { method: 'session/close', params: { sessionId: 'session-1' } } },
      { path: '/api/astrid/acp/connection-1', method: 'DELETE' },
    ]);
  });

  it('fails closed before session recovery when the bridge credential is unauthorized', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: 'unauthorized', detail: 'credential revoked' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    render(<AstridAcpSessionControls enabled />);
    await userEvent.setup().click(screen.getByTestId('astrid-acp-connect'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('credential revoked'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails closed when reconnect reports a dead ACP process', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = requestCall(input, init);
      calls.push(call);
      if (call.path === '/api/astrid/acp/connect') return jsonResponse({ connection_id: 'connection-1', initialize: {} });
      if (call.path.endsWith('/rpc')) return jsonResponse({ result: { sessions: [] } });
      if (call.path.endsWith('/reconnect')) {
        return jsonResponse({ error: 'acp_process_exited', detail: 'ACP process exited; reconnect requires a new host process' }, 502);
      }
      throw new Error(`unexpected ${call.path}`);
    }));

    render(<AstridAcpSessionControls enabled />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('astrid-acp-connect'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connected; no sessions found'));
    await user.click(screen.getByTestId('astrid-acp-connect'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('ACP process exited'));
    expect(calls.some((call) => call.path.endsWith('/rpc') && (call.body as { method?: string })?.method === 'session/load')).toBe(false);
  });

  it('surfaces a closed-session refusal after an exact listed selection', async () => {
    const calls: Call[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = requestCall(input, init);
      calls.push(call);
      if (call.path === '/api/astrid/acp/connect') return jsonResponse({ connection_id: 'connection-1', initialize: {} });
      if (call.path.endsWith('/rpc')) {
        const method = (call.body as { method?: string }).method;
        if (method === 'session/list') return jsonResponse({ result: { sessions: [{ sessionId: 'closed-session' }] } });
        return jsonResponse({ error: 'not_found', detail: 'session is closed' }, 404);
      }
      throw new Error(`unexpected ${call.path}`);
    }));

    render(<AstridAcpSessionControls enabled />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('astrid-acp-connect'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connected; select a session'));
    await user.selectOptions(screen.getByLabelText('Astrid ACP session ID'), 'closed-session');
    await user.click(screen.getByTestId('astrid-acp-resume'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('session is closed'));
    expect(calls.some((call) => call.path.endsWith('/rpc') && (call.body as { method?: string })?.method === 'session/load')).toBe(true);
  });
});
