import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseClientFactoryMock = vi.hoisted(() => vi.fn());
const normalizeAndPresentErrorMock = vi.hoisted(() => vi.fn());
const transformToGenerationRowMock = vi.hoisted(() => vi.fn((row: { id: string }) => ({
  id: `mapped-${row.id}`,
} as never)));

const segmentQueryKeysMock = vi.hoisted(() => ({
  parents: (shotId: string, projectId?: string) => ['parents', shotId, projectId] as const,
  children: (selectedParentId: string) => ['children', selectedParentId] as const,
  liveTimeline: (shotId: string) => ['liveTimeline', shotId] as const,
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => supabaseClientFactoryMock(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => normalizeAndPresentErrorMock(...args),
}));

vi.mock('@/shared/lib/queryKeys/segments', () => ({
  segmentQueryKeys: segmentQueryKeysMock,
}));

vi.mock('../segmentDataTransforms', () => ({
  transformToGenerationRow: (...args: unknown[]) => transformToGenerationRowMock(...args),
}));

import {
  buildChildrenQueryKey,
  buildLiveTimelineQueryKey,
  buildParentGenerationsQueryKey,
  fetchChildGenerations,
  fetchLiveTimeline,
  fetchParentGenerations,
} from '../segmentOutputsQueries';

function mockParentQuery(response: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(response);
  const eqProject = vi.fn().mockReturnValue({ order });
  const eqShot = vi.fn().mockReturnValue({ eq: eqProject });
  const select = vi.fn().mockReturnValue({ eq: eqShot });
  const from = vi.fn().mockReturnValue({ select });
  supabaseClientFactoryMock.mockReturnValue({ from });
  return { eqProject, eqShot, from, order, select };
}

function mockChildQuery(response: { data: unknown; error: unknown }) {
  const orderByCreatedAt = vi.fn().mockResolvedValue(response);
  const orderByChildOrder = vi.fn().mockReturnValue({ order: orderByCreatedAt });
  const eqParent = vi.fn().mockReturnValue({ order: orderByChildOrder });
  const select = vi.fn().mockReturnValue({ eq: eqParent });
  const from = vi.fn().mockReturnValue({ select });
  supabaseClientFactoryMock.mockReturnValue({ from });
  return { eqParent, from, orderByChildOrder, orderByCreatedAt, select };
}

function mockLiveTimelineQuery(response: { data: unknown; error: unknown }) {
  const order = vi.fn().mockResolvedValue(response);
  const gte = vi.fn().mockReturnValue({ order });
  const eqShot = vi.fn().mockReturnValue({ gte });
  const select = vi.fn().mockReturnValue({ eq: eqShot });
  const from = vi.fn().mockReturnValue({ select });
  supabaseClientFactoryMock.mockReturnValue({ from });
  return { eqShot, from, gte, order, select };
}

describe('segmentOutputsQueries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds stable query keys for parents/children/live timeline', () => {
    expect(buildParentGenerationsQueryKey('shot-1', 'project-1')).toEqual(
      ['parents', 'shot-1', 'project-1'],
    );
    expect(buildParentGenerationsQueryKey('shot-1', null)).toEqual(
      ['parents', 'shot-1', undefined],
    );
    expect(buildChildrenQueryKey('parent-1')).toEqual(['children', 'parent-1']);
    expect(buildLiveTimelineQueryKey('shot-1')).toEqual(['liveTimeline', 'shot-1']);
  });

  it('fetchParentGenerations maps raw rows through transformToGenerationRow', async () => {
    const raw = [{ id: 'p1' }, { id: 'p2' }];
    const spies = mockParentQuery({ data: raw, error: null });

    const result = await fetchParentGenerations('shot-1', 'project-1');

    expect(spies.from).toHaveBeenCalledWith('shot_final_videos');
    expect(spies.select).toHaveBeenCalledWith('*');
    expect(spies.eqShot).toHaveBeenCalledWith('shot_id', 'shot-1');
    expect(spies.eqProject).toHaveBeenCalledWith('project_id', 'project-1');
    expect(spies.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(transformToGenerationRowMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual([{ id: 'mapped-p1' }, { id: 'mapped-p2' }]);
  });

  it('fetchParentGenerations normalizes and rethrows query errors', async () => {
    const error = new Error('parent query failed');
    mockParentQuery({ data: null, error });

    await expect(fetchParentGenerations('shot-1', 'project-1')).rejects.toThrow(error);
    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        context: 'useSegmentOutputsForShot.fetchParents',
      }),
    );
  });

  it('fetchChildGenerations maps ordered child rows through transformToGenerationRow', async () => {
    const raw = [{ id: 'c1' }, { id: 'c2' }];
    const spies = mockChildQuery({ data: raw, error: null });

    const result = await fetchChildGenerations('parent-1');

    expect(spies.from).toHaveBeenCalledWith('generations');
    expect(spies.select).toHaveBeenCalledWith('*');
    expect(spies.eqParent).toHaveBeenCalledWith('parent_generation_id', 'parent-1');
    expect(spies.orderByChildOrder).toHaveBeenCalledWith('child_order', { ascending: true });
    expect(spies.orderByCreatedAt).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result).toEqual([{ id: 'mapped-c1' }, { id: 'mapped-c2' }]);
  });

  it('fetchLiveTimeline returns timeline rows unchanged on success', async () => {
    const timelineRows = [
      { id: 'sg-1', generation_id: 'g1', timeline_frame: 0 },
      { id: 'sg-2', generation_id: 'g2', timeline_frame: 24 },
    ];
    const spies = mockLiveTimelineQuery({ data: timelineRows, error: null });

    const result = await fetchLiveTimeline('shot-1');

    expect(spies.from).toHaveBeenCalledWith('shot_generations');
    expect(spies.select).toHaveBeenCalledWith('id, generation_id, timeline_frame');
    expect(spies.eqShot).toHaveBeenCalledWith('shot_id', 'shot-1');
    expect(spies.gte).toHaveBeenCalledWith('timeline_frame', 0);
    expect(spies.order).toHaveBeenCalledWith('timeline_frame', { ascending: true });
    expect(result).toEqual(timelineRows);
  });

  it('fetchLiveTimeline normalizes and rethrows errors', async () => {
    const error = new Error('timeline query failed');
    mockLiveTimelineQuery({ data: null, error });

    await expect(fetchLiveTimeline('shot-1')).rejects.toThrow(error);
    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        context: 'useSegmentOutputsForShot.fetchLiveTimeline',
      }),
    );
  });
});
