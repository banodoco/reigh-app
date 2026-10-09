import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSendMessage } from './useAgentSession.ts';

describe('cut timeline-agent proposal vertical', () => {
  it('cannot import or apply an edge proposal when the bridge capability is absent', async () => {
    const queryClient = new QueryClient();
    const proposalApply = vi.fn();
    const request = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.endsWith('/acp/projects/project-1/chat')
        ? { project_id: 'project-1', scope_key: 'project-1', revision: 1, selected_session_id: 'session-1', sessions: [{ id: 'session-1' }], draft: { text: '', revision: 1 } }
        : url.endsWith('/connect')
        ? { connection_id: 'connection-1', initialize: {} }
        : url.endsWith('/rpc')
          ? { result: {} }
          : { error: 'session_not_owned', detail: 'Session does not belong to this project' };
      return new Response(JSON.stringify(payload), { status: url.endsWith('/prompt') ? 403 : 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', request);
    const context = {
      tool: 'video-editor' as const,
      projectId: 'project-1',
      projectSlug: 'project-one',
      timelineId: 'tl-1',
      timelineName: 'Timeline',
      elementOperationAdapter: { execute: proposalApply },
    };
    const { result, unmount } = renderHook(() => useSendMessage('session-1', context), {
      wrapper: ({ children }: { children: React.ReactNode }) => React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children,
      ),
    });

    let mutationError: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync({ input: { message: 'apply proposal' }, projectId: 'project-1', sessionId: 'session-1', context });
      } catch (error) { mutationError = error; }
    });
    expect(mutationError).toMatchObject({ code: 'session_not_owned' });
    expect(request.mock.calls.some(([input]) => String(input).endsWith('/acp/projects/project-1/chat/prompt'))).toBe(true);
    expect(proposalApply).not.toHaveBeenCalled();
    unmount();
    vi.unstubAllGlobals();
  });
});
