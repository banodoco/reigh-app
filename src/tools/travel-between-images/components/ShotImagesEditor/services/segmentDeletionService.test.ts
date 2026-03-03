import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '@/shared/lib/queryKeys';
import {
  deleteSegmentGenerationGroup,
  syncSegmentDeletionCaches,
} from './segmentDeletionService';

const mocks = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
  normalizeAndPresentAndRethrow: vi.fn(),
  resolveTravelPairShotGenerationId: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: (...args: unknown[]) => mocks.getSupabaseClient(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentAndRethrow: (...args: unknown[]) => mocks.normalizeAndPresentAndRethrow(...args),
}));

vi.mock('@/shared/lib/tasks/travelPayloadReader', () => ({
  resolveTravelPairShotGenerationId: (...args: unknown[]) => mocks.resolveTravelPairShotGenerationId(...args),
}));

describe('segmentDeletionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no-op result when target generation does not exist', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const idEq = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }));
    const select = vi.fn(() => ({ eq: idEq }));
    const from = vi.fn(() => ({ select }));
    mocks.getSupabaseClient.mockReturnValue({ from });

    const result = await deleteSegmentGenerationGroup({
      generationId: 'missing-gen',
      projectId: 'project-1',
    });

    expect(result).toEqual({
      deleted: false,
      idsToDelete: [],
      parentGenerationId: null,
    });
    expect(mocks.normalizeAndPresentAndRethrow).not.toHaveBeenCalled();
  });

  it('deletes sibling segment rows sharing the same resolved pair id', async () => {
    const beforeData = {
      id: 'child-2',
      project_id: 'project-1',
      parent_generation_id: 'parent-1',
      pair_shot_generation_id: 'pair-a',
      params: { orchestrator_details: {} },
    };

    const siblings = [
      { id: 'child-1', pair_shot_generation_id: 'pair-a', params: {} },
      { id: 'child-2', pair_shot_generation_id: 'pair-b', params: {} },
    ];

    const maybeSingle = vi.fn().mockResolvedValue({ data: beforeData, error: null });
    const firstLookup = {
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    };

    const secondLookup = {
      eq: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ data: siblings, error: null }),
      })),
    };

    const deleteEq = vi.fn().mockResolvedValue({ error: null });
    const deleteCall = {
      in: vi.fn(() => ({
        eq: deleteEq,
      })),
    };

    const from = vi.fn()
      .mockReturnValueOnce({ select: vi.fn(() => firstLookup) })
      .mockReturnValueOnce({ select: vi.fn(() => secondLookup) })
      .mockReturnValueOnce({ delete: vi.fn(() => deleteCall) });
    mocks.getSupabaseClient.mockReturnValue({ from });

    mocks.resolveTravelPairShotGenerationId
      .mockReturnValueOnce('pair-a')
      .mockReturnValueOnce('pair-a')
      .mockReturnValueOnce('pair-b');

    const result = await deleteSegmentGenerationGroup({
      generationId: 'child-2',
      projectId: 'project-1',
    });

    expect(result).toEqual({
      deleted: true,
      idsToDelete: ['child-1'],
      parentGenerationId: 'parent-1',
    });
    expect(deleteCall.in).toHaveBeenCalledWith('id', ['child-1']);
    expect(deleteEq).toHaveBeenCalledWith('project_id', 'project-1');
  });

  it('updates local caches and invalidates dependent query groups', async () => {
    const setQueryData = vi.fn();
    const setQueriesData = vi.fn();
    const invalidateQueries = vi.fn().mockResolvedValue(undefined);

    const queryClient = {
      setQueryData,
      setQueriesData,
      invalidateQueries,
    };

    await syncSegmentDeletionCaches({
      queryClient: queryClient as never,
      projectId: 'project-9',
      parentGenerationId: 'parent-9',
      idsToDelete: ['remove-me'],
    });

    expect(setQueryData).toHaveBeenCalledTimes(1);
    const setQueryDataUpdater = setQueryData.mock.calls[0][1] as (input: unknown) => unknown;
    expect(setQueryDataUpdater([{ id: 'keep' }, { id: 'remove-me' }])).toEqual([{ id: 'keep' }]);

    expect(setQueriesData).toHaveBeenCalledTimes(1);
    const setQueriesDataUpdater = setQueriesData.mock.calls[0][1] as (input: unknown) => unknown;
    expect(setQueriesDataUpdater([{ id: 'keep' }, { id: 'remove-me' }])).toEqual([{ id: 'keep' }]);

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.unified.all });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.shots.list('project-9') });
    expect(invalidateQueries).toHaveBeenCalledTimes(4);
  });
});
