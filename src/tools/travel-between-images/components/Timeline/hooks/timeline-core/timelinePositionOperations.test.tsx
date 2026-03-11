import { act, renderHook } from '@testing-library/react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  quantizePositions: vi.fn((positions: Map<string, number>) => new Map(positions)),
  persistTimelineFrameBatch: vi.fn(),
  clearTrailingEndpointFrame: vi.fn(),
  setTrailingEndpointFrame: vi.fn(),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

vi.mock('@/shared/lib/timelineFrameBatchPersist', () => ({
  persistTimelineFrameBatch: mocks.persistTimelineFrameBatch,
}));

vi.mock('../../utils/timeline-utils', () => ({
  TRAILING_ENDPOINT_KEY: '__trailing__',
  quantizePositions: mocks.quantizePositions,
}));

vi.mock('../segment/timelineTrailingEndpointPersistence', () => ({
  clearTrailingEndpointFrame: mocks.clearTrailingEndpointFrame,
  setTrailingEndpointFrame: mocks.setTrailingEndpointFrame,
}));

import { useTimelinePositionOperations } from './timelinePositionOperations';

const TRAILING_ENDPOINT_KEY = '__trailing__';

function createGeneration(id: string, timeline_frame: number | null): GenerationRow {
  return {
    id,
    timeline_frame,
    metadata: null,
  } as GenerationRow;
}

function createHarness(options?: {
  shotId?: string | null;
  initialPositions?: Array<[string, number]>;
  shotGenerations?: GenerationRow[];
}) {
  const positionsRef = {
    current: new Map(options?.initialPositions ?? [['img-1', 0], ['img-2', 10]]),
  } as MutableRefObject<Map<string, number>>;
  const pendingUpdatesRef = {
    current: new Map(),
  } as MutableRefObject<Map<string, {
    id: string;
    oldPosition: number | null;
    newPosition: number;
    operation: 'add' | 'move' | 'remove';
    timestamp: number;
  }>>;
  const operationIdRef = { current: 0 } as MutableRefObject<number>;
  const snapshotRef = { current: null } as MutableRefObject<Map<string, number> | null>;
  const isLockedRef = { current: false } as MutableRefObject<boolean>;
  const isUpdatingRef = { current: false } as MutableRefObject<boolean>;
  const writeInFlightRef = { current: 0 } as MutableRefObject<number>;
  const setStatus = vi.fn<Dispatch<SetStateAction<{ type: string }>>>();
  const invalidateGenerations = vi.fn();

  const setPositions = vi.fn<Dispatch<SetStateAction<Map<string, number>>>>((update) => {
    const next = typeof update === 'function'
      ? (update as (current: Map<string, number>) => Map<string, number>)(new Map(positionsRef.current))
      : update;
    positionsRef.current = new Map(next);
  });

  const params = {
    shotId: options?.shotId ?? 'shot-1',
    shotGenerations: options?.shotGenerations ?? [
      createGeneration('img-1', 0),
      createGeneration('img-2', 10),
    ],
    setPositions,
    positionsRef,
    setStatus,
    pendingUpdatesRef,
    operationIdRef,
    snapshotRef,
    isLockedRef,
    isUpdatingRef,
    writeInFlightRef,
    invalidateGenerations,
  };

  return {
    params,
    positionsRef,
    pendingUpdatesRef,
    snapshotRef,
    isLockedRef,
    isUpdatingRef,
    writeInFlightRef,
    setPositions,
    setStatus,
    invalidateGenerations,
  };
}

describe('useTimelinePositionOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.quantizePositions.mockImplementation((positions: Map<string, number>) => new Map(positions));
    mocks.persistTimelineFrameBatch.mockResolvedValue({
      updateCount: 1,
      durationMs: 12,
      skipped: false,
    });
    mocks.clearTrailingEndpointFrame.mockResolvedValue(undefined);
    mocks.setTrailingEndpointFrame.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('applies optimistic updates and rolls them back cleanly', () => {
    const harness = createHarness();
    const { result } = renderHook(() => useTimelinePositionOperations(harness.params));

    let rollback: (() => void) | null = null;
    act(() => {
      rollback = result.current.applyOptimisticPositionUpdate(new Map([
        ['img-1', 5],
        ['img-2', 10],
        ['img-3', 15],
      ]));
    });

    expect(rollback).toBeTypeOf('function');
    expect(harness.positionsRef.current).toEqual(new Map([
      ['img-1', 5],
      ['img-2', 10],
      ['img-3', 15],
    ]));
    expect(Array.from(harness.pendingUpdatesRef.current.values())).toEqual([
      expect.objectContaining({ id: 'img-1', oldPosition: 0, newPosition: 5, operation: 'move' }),
      expect.objectContaining({ id: 'img-3', oldPosition: null, newPosition: 15, operation: 'add' }),
    ]);

    act(() => {
      rollback?.();
    });

    expect(harness.positionsRef.current).toEqual(new Map([
      ['img-1', 0],
      ['img-2', 10],
    ]));
    expect(harness.pendingUpdatesRef.current.size).toBe(0);
    expect(harness.snapshotRef.current).toBeNull();
  });

  it('adds and removes items through optimistic helpers', () => {
    const harness = createHarness();
    const { result } = renderHook(() => useTimelinePositionOperations(harness.params));

    let rollbackAdd: (() => void) | null = null;
    act(() => {
      rollbackAdd = result.current.addItemsAtPositions([{ id: 'img-3', position: 20 }]);
    });

    expect(harness.positionsRef.current).toEqual(new Map([
      ['img-1', 0],
      ['img-2', 10],
      ['img-3', 20],
    ]));

    act(() => {
      rollbackAdd?.();
    });

    let rollbackRemove: (() => void) | null = null;
    act(() => {
      rollbackRemove = result.current.removeItems(['img-2']);
    });

    expect(harness.positionsRef.current).toEqual(new Map([
      ['img-1', 0],
    ]));

    act(() => {
      rollbackRemove?.();
    });

    expect(harness.positionsRef.current).toEqual(new Map([
      ['img-1', 0],
      ['img-2', 10],
    ]));
  });

  it('rejects duplicate positions before persisting', async () => {
    const harness = createHarness();
    const { result } = renderHook(() => useTimelinePositionOperations(harness.params));

    await act(async () => {
      await result.current.updatePositions(new Map([
        ['img-1', 5],
        ['img-2', 5],
      ]));
    });

    expect(mocks.toastError).toHaveBeenCalledWith('Position conflict detected - operation cancelled');
    expect(mocks.persistTimelineFrameBatch).not.toHaveBeenCalled();
    expect(harness.setStatus).not.toHaveBeenCalled();
  });

  it('persists successful updates and clears a removed trailing endpoint', async () => {
    const harness = createHarness({
      initialPositions: [
        ['img-1', 0],
        ['img-2', 10],
        [TRAILING_ENDPOINT_KEY, 24],
      ],
    });
    const { result } = renderHook(() => useTimelinePositionOperations(harness.params));

    await act(async () => {
      await result.current.updatePositions(new Map([
        ['img-1', 0],
        ['img-2', 15],
      ]), {
        operation: 'drop',
        metadata: { source: 'test' },
      });
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(mocks.setTrailingEndpointFrame).not.toHaveBeenCalled();
    expect(mocks.clearTrailingEndpointFrame).toHaveBeenCalledWith(expect.objectContaining({
      shotId: 'shot-1',
      shotGenerations: harness.params.shotGenerations,
    }));
    expect(mocks.persistTimelineFrameBatch).toHaveBeenCalledWith(expect.objectContaining({
      shotId: 'shot-1',
      operationLabel: 'timeline-positions-drop',
      timeoutOperationName: 'timeline-positions-batch-rpc',
      updates: [
        {
          shotGenerationId: 'img-2',
          timelineFrame: 15,
          metadata: {
            user_positioned: true,
            drag_source: 'drop',
            source: 'test',
          },
        },
      ],
    }));
    expect(harness.invalidateGenerations).toHaveBeenCalledWith('shot-1', {
      reason: 'timeline-position-batch-persist',
      scope: 'images',
      delayMs: 100,
    });
    expect(harness.writeInFlightRef.current).toBe(0);
    expect(harness.isLockedRef.current).toBe(false);
    expect(harness.isUpdatingRef.current).toBe(false);
  });

  it('rolls back optimistic state when persistence fails', async () => {
    const harness = createHarness();
    const { result } = renderHook(() => useTimelinePositionOperations(harness.params));
    const error = new Error('persist failed');
    mocks.persistTimelineFrameBatch.mockRejectedValueOnce(error);

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.updatePositions(new Map([
          ['img-1', 0],
          ['img-2', 15],
        ]));
      } catch (caught) {
        thrown = caught;
      }
    });
    act(() => {
      vi.runAllTimers();
    });

    expect(thrown).toBe(error);
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(error, expect.objectContaining({
      context: 'TimelinePositions',
      showToast: false,
      logData: { operationId: 'op-1-reorder' },
    }));
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to update positions');
    expect(harness.positionsRef.current).toEqual(new Map([
      ['img-1', 0],
      ['img-2', 10],
    ]));
    expect(harness.pendingUpdatesRef.current.size).toBe(0);
  });
});
