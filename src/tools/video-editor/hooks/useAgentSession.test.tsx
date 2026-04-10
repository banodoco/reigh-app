// @vitest-environment jsdom
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSendMessage } from './useAgentSession';

const invokeMock = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    functions: {
      invoke: invokeMock,
    },
    channel: vi.fn(),
    removeChannel: vi.fn(),
    from: vi.fn(),
    auth: {
      getUser: vi.fn(),
    },
  }),
}));

function createWrapper() {
  const queryClient = new QueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe('useSendMessage', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      data: {
        session_id: 'session-1',
        status: 'waiting_user',
        turns_added: 1,
      },
      error: null,
    });
  });

  it('includes optional generation and shot metadata only for attachments that provide it', async () => {
    const { result } = renderHook(
      () => useSendMessage('session-1', 'timeline-1'),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.mutateAsync({
        message: 'Use these as references',
        attachments: [
          {
            clipId: 'clip-1',
            url: 'https://example.com/image.png',
            mediaType: 'image',
            isTimelineBacked: true,
            generationId: 'gen-1',
            variantId: 'variant-1',
            shotId: 'shot-1',
            shotName: 'Hero Shot',
            shotSelectionClipCount: 4,
            trackId: 'V1',
            at: 12.5,
            duration: 3,
          },
          {
            clipId: 'clip-2',
            url: 'https://example.com/video.mp4',
            mediaType: 'video',
            isTimelineBacked: false,
          },
        ],
      });
    });

    expect(invokeMock).toHaveBeenCalledWith('ai-timeline-agent', {
      body: {
        session_id: 'session-1',
        user_message: 'Use these as references',
        selected_clips: [
          {
            clip_id: 'clip-1',
            url: 'https://example.com/image.png',
            media_type: 'image',
            is_timeline_backed: true,
            generation_id: 'gen-1',
            variant_id: 'variant-1',
            shot_id: 'shot-1',
            shot_name: 'Hero Shot',
            shot_selection_clip_count: 4,
            track_id: 'V1',
            at: 12.5,
            duration: 3,
          },
          {
            clip_id: 'clip-2',
            url: 'https://example.com/video.mp4',
            media_type: 'video',
            is_timeline_backed: false,
          },
        ],
      },
    });
  });

  it('preserves timeline attachment coordinates in the selected_clips payload', async () => {
    const { result } = renderHook(
      () => useSendMessage('session-1', 'timeline-1'),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.mutateAsync({
        message: 'Edit this clip',
        attachments: [
          {
            clipId: 'clip-timeline-1',
            url: 'https://example.com/timeline.png',
            mediaType: 'image',
            isTimelineBacked: true,
            trackId: 'V2',
            at: 4.25,
            duration: 1.75,
          },
        ],
      });
    });

    expect(invokeMock).toHaveBeenCalledWith('ai-timeline-agent', {
      body: {
        session_id: 'session-1',
        user_message: 'Edit this clip',
        selected_clips: [{
          clip_id: 'clip-timeline-1',
          url: 'https://example.com/timeline.png',
          media_type: 'image',
          is_timeline_backed: true,
          track_id: 'V2',
          at: 4.25,
          duration: 1.75,
        }],
      },
    });
  });
});
