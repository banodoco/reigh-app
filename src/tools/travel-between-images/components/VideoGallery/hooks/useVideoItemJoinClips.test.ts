import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  supabaseFrom: vi.fn(),
  runPlaceholder: vi.fn(),
  createTask: vi.fn(),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: Object.assign(mocks.toast, {
    error: mocks.toast,
    success: mocks.toast,
    warning: mocks.toast,
    info: mocks.toast,
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({ from: mocks.supabaseFrom }),
}));

vi.mock('@/shared/hooks/tasks/useTaskPlaceholder', () => ({
  useTaskPlaceholder: () => mocks.runPlaceholder,
}));

vi.mock('@/shared/lib/taskCreation', () => ({
  createTask: (...args: unknown[]) => mocks.createTask(...args),
}));

import { useVideoItemJoinClips } from './useVideoItemJoinClips';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) => React.createElement(
    QueryClientProvider,
    { client: queryClient },
    children,
  );
}

describe('useVideoItemJoinClips legacy boundary', () => {
  it('keeps the confirmation modal open and rejects before submission after child discovery', async () => {
    const builder = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
    };
    builder.select.mockReturnValue(builder);
    builder.eq.mockReturnValue(builder);
    builder.order
      .mockReturnValueOnce(builder)
      .mockResolvedValueOnce({
        data: [
          { id: 'child-1', location: 'https://cdn.example/1.mp4', type: 'video', params: {}, parent_generation_id: 'parent-1', child_order: 0 },
          { id: 'child-2', location: 'https://cdn.example/2.mp4', type: 'video', params: {}, parent_generation_id: 'parent-1', child_order: 1 },
        ],
        error: null,
      });
    mocks.supabaseFrom.mockReturnValue(builder);

    const { result } = renderHook(
      () => useVideoItemJoinClips(
        { id: 'parent-1', location: null, parent_generation_id: null } as never,
        'project-1',
        '16:9',
      ),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.canJoinClips).toBe(true));
    const discoveryCallCount = mocks.supabaseFrom.mock.calls.length;

    act(() => {
      result.current.handleJoinClipsClick({ stopPropagation: vi.fn() } as never);
    });
    expect(result.current.showJoinModal).toBe(true);

    await act(async () => {
      await result.current.handleConfirmJoin();
    });

    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Joining segments is not yet supported',
      variant: 'destructive',
    }));
    expect(result.current.showJoinModal).toBe(true);
    expect(result.current.isJoiningClips).toBe(false);
    expect(mocks.supabaseFrom).toHaveBeenCalledTimes(discoveryCallCount);
    expect(mocks.runPlaceholder).not.toHaveBeenCalled();
    expect(mocks.createTask).not.toHaveBeenCalled();
  });
});
