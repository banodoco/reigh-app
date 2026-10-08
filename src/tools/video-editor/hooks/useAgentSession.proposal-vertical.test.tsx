import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSendMessage } from './useAgentSession.ts';

describe('cut timeline-agent proposal vertical', () => {
  it('cannot import or apply an edge proposal when the bridge capability is absent', async () => {
    const queryClient = new QueryClient();
    const proposalApply = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.endsWith('/connect')
        ? { connection_id: 'connection-1', initialize: {} }
        : url.endsWith('/rpc')
          ? { result: {} }
          : { error: 'session_not_owned', detail: 'Session does not belong to this project' };
      return new Response(JSON.stringify(payload), { status: url.endsWith('/prompt') ? 403 : 200, headers: { 'Content-Type': 'application/json' } });
    }));
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
    expect(proposalApply).not.toHaveBeenCalled();
    unmount();
    vi.unstubAllGlobals();
  });
});
