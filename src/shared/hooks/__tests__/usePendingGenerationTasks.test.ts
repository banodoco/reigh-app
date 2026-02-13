import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockSelect = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => mockSelect()),
        })),
      })),
    })),
  },
}));

vi.mock('@/types/tasks', () => ({
  TASK_STATUS: { QUEUED: 'Queued', IN_PROGRESS: 'In Progress' },
}));

import { usePendingGenerationTasks } from '../usePendingGenerationTasks';

describe('usePendingGenerationTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty when generationId is null', () => {
    const { result } = renderHookWithProviders(() =>
      usePendingGenerationTasks(null, 'proj-1')
    );
    expect(result.current.pendingCount).toBe(0);
    expect(result.current.pendingTasks).toEqual([]);
  });

  it('returns empty when projectId is null', () => {
    const { result } = renderHookWithProviders(() =>
      usePendingGenerationTasks('gen-1', null)
    );
    expect(result.current.pendingCount).toBe(0);
  });

  it('fetches and filters tasks referencing the generation', async () => {
    mockSelect.mockResolvedValue({
      data: [
        { id: 't1', status: 'Queued', task_type: 'video_generation', params: { based_on: 'gen-1' } },
        { id: 't2', status: 'In Progress', task_type: 'video_generation', params: { based_on: 'gen-other' } },
      ],
      error: null,
    });

    const { result } = renderHookWithProviders(() =>
      usePendingGenerationTasks('gen-1', 'proj-1')
    );

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });
    expect(result.current.pendingTasks[0].id).toBe('t1');
  });

  it('handles query errors gracefully', async () => {
    mockSelect.mockResolvedValue({
      data: null,
      error: { message: 'Query failed' },
    });

    const { result } = renderHookWithProviders(() =>
      usePendingGenerationTasks('gen-1', 'proj-1')
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.pendingCount).toBe(0);
  });

  it('detects generation references in nested params', async () => {
    mockSelect.mockResolvedValue({
      data: [
        {
          id: 't1', status: 'Queued', task_type: 'travel_segment',
          params: {
            orchestrator_details: {
              pair_shot_generation_ids: ['gen-1', 'gen-2'],
            },
          },
        },
      ],
      error: null,
    });

    const { result } = renderHookWithProviders(() =>
      usePendingGenerationTasks('gen-1', 'proj-1')
    );

    await waitFor(() => {
      expect(result.current.pendingCount).toBe(1);
    });
  });
});
