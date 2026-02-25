import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockDbUpdate = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => mockDbUpdate()),
        })),
      })),
    })),
  }),
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('../timelineFrameCalculators', () => ({
  findGeneration: vi.fn((gens: unknown[], id: string) =>
    gens.find((sg: unknown) => sg.generation_id === id || sg.id === id) || null
  ),
  calculateDistributedFrames: vi.fn(() => []),
  deduplicateUpdates: vi.fn((_updates: unknown) => new Map()),
  buildAndNormalizeFinalPositions: vi.fn((_updates: unknown) => new Map()),
}));

import { useTimelineFrameUpdates } from '../useTimelineFrameUpdates';

describe('useTimelineFrameUpdates', () => {
  const mockSyncShotData = vi.fn().mockResolvedValue(undefined);
  const mockShotGenerations = [
    { id: 'sg-1', generation_id: 'gen-1', timeline_frame: 0, shot_id: 'shot-1' },
    { id: 'sg-2', generation_id: 'gen-2', timeline_frame: 100, shot_id: 'shot-1' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbUpdate.mockResolvedValue({ error: null });
  });

  it('returns expected functions', () => {
    const { result } = renderHookWithProviders(() =>
      useTimelineFrameUpdates({
        shotId: 'shot-1',
        projectId: 'proj-1',
        shotGenerations: mockShotGenerations as unknown,
        syncShotData: mockSyncShotData,
      })
    );

    expect(typeof result.current.updateTimelineFrame).toBe('function');
    expect(typeof result.current.batchExchangePositions).toBe('function');
    expect(typeof result.current.moveItemsToMidpoint).toBe('function');
  });

  it('updateTimelineFrame throws when shotId is null', async () => {
    const { result } = renderHookWithProviders(() =>
      useTimelineFrameUpdates({
        shotId: null,
        projectId: 'proj-1',
        shotGenerations: mockShotGenerations as unknown,
        syncShotData: mockSyncShotData,
      })
    );

    await expect(
      act(async () => {
        await result.current.updateTimelineFrame('gen-1', 50);
      })
    ).rejects.toThrow('No shotId provided');
  });

  it('updateTimelineFrame calls supabase and syncShotData', async () => {
    const { result } = renderHookWithProviders(() =>
      useTimelineFrameUpdates({
        shotId: 'shot-1',
        projectId: 'proj-1',
        shotGenerations: mockShotGenerations as unknown,
        syncShotData: mockSyncShotData,
      })
    );

    await act(async () => {
      await result.current.updateTimelineFrame('gen-1', 50);
    });

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockSyncShotData).toHaveBeenCalledWith('gen-1', 'shot-1', 50);
  });

  it('updateTimelineFrame throws when generation not found', async () => {
    const { result } = renderHookWithProviders(() =>
      useTimelineFrameUpdates({
        shotId: 'shot-1',
        projectId: 'proj-1',
        shotGenerations: mockShotGenerations as unknown,
        syncShotData: mockSyncShotData,
      })
    );

    await expect(
      act(async () => {
        await result.current.updateTimelineFrame('nonexistent', 50);
      })
    ).rejects.toThrow('Shot generation not found');
  });

  it('batchExchangePositions throws when shotId is null', async () => {
    const { result } = renderHookWithProviders(() =>
      useTimelineFrameUpdates({
        shotId: null,
        projectId: 'proj-1',
        shotGenerations: mockShotGenerations as unknown,
        syncShotData: mockSyncShotData,
      })
    );

    await expect(
      act(async () => {
        await result.current.batchExchangePositions([]);
      })
    ).rejects.toThrow('No shotId provided');
  });
});
