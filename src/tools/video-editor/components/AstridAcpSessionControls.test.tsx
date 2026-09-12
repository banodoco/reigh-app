import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AstridAcpSessionControls } from './AstridAcpSessionControls.tsx';

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('AstridAcpSessionControls', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('drives connect/create/resume/cancel/close and reconnect without persisting IDs', async () => {
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
      if (url.pathname.endsWith('/rpc')) return jsonResponse({ result: { sessionId: 'session-1' } });
      if (url.pathname.startsWith('/api/astrid/acp/')) {
        return jsonResponse({ connection_id: 'connection-1', closed: true });
      }
      throw new Error(`unexpected ${url.pathname}`);
    }));

    render(<AstridAcpSessionControls enabled />);
    const user = userEvent.setup();

    await user.click(screen.getByTestId('astrid-acp-connect'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Connected'));
    await user.click(screen.getByTestId('astrid-acp-create'));
    await waitFor(() => expect(screen.getByDisplayValue('session-1')).toBeInTheDocument());

    await user.click(screen.getByTestId('astrid-acp-connect'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Reconnected and resumed'));
    await user.click(screen.getByTestId('astrid-acp-cancel'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Session cancellation requested'));
    await user.click(screen.getByTestId('astrid-acp-close'));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Disconnected'));

    expect(calls).toEqual([
      { path: '/api/astrid/acp/connect', method: 'POST', body: {} },
      { path: '/api/astrid/acp/connection-1/rpc', method: 'POST', body: { method: 'session/new', params: { mcpServers: [] } } },
      { path: '/api/astrid/acp/connection-1/reconnect', method: 'POST', body: {} },
      { path: '/api/astrid/acp/connection-1/rpc', method: 'POST', body: { method: 'session/resume', params: { sessionId: 'session-1' } } },
      { path: '/api/astrid/acp/connection-1/cancel', method: 'POST', body: { sessionId: 'session-1' } },
      { path: '/api/astrid/acp/connection-1/rpc', method: 'POST', body: { method: 'session/close', params: { sessionId: 'session-1' } } },
      { path: '/api/astrid/acp/connection-1', method: 'DELETE' },
    ]);
  });
});
