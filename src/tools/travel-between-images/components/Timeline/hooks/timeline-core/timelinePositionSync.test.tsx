import { act, renderHook } from '@testing-library/react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import { TRAILING_ENDPOINT_KEY } from '../../utils/timeline-utils';

const mocks = vi.hoisted(() => ({
  isTimelineWriteActive: vi.fn(() => false),
}));

vi.mock('@/shared/lib/timelineWriteQueue', () => ({
  isTimelineWriteActive: mocks.isTimelineWriteActive,
}));

import { useTimelinePositionSync } from './timelinePositionSync';

function createGeneration(
  id: string,
  timeline_frame: number | null,
  metadata: Record<string, unknown> | null = null,
): GenerationRow {
  return {
    id,
    timeline_frame,
    metadata,
  } as GenerationRow;
}

function createHarness(options?: {
  shotId?: string | null;
  shotGenerations?: GenerationRow[];
  initialPositions?: Array<[string, number]>;
}) {
  const positionsRef = {
    current: new Map(options?.initialPositions ?? []),
  } as MutableRefObject<Map<string, number>>;
  const pendingUpdatesRef = {
    current: new Map([
      ['img-1', {
        id: 'img-1',
        oldPosition: 0,
        newPosition: 4,
        operation: 'move' as const,
        timestamp: Date.now(),
      }],
      ['img-2', {
        id: 'img-2',
        oldPosition: 10,
        newPosition: 10,
        operation: 'move' as const,
        timestamp: Date.now(),
      }],
    ]),
  } as MutableRefObject<Map<string, {
    id: string;
    oldPosition: number | null;
    newPosition: number;
    operation: 'add' | 'move' | 'remove';
    timestamp: number;
  }>>;
  const lastSyncRef = { current: '' } as MutableRefObject<string>;
  const isLockedRef = { current: false } as MutableRefObject<boolean>;
  const isUpdatingRef = { current: false } as MutableRefObject<boolean>;
  const writeInFlightRef = { current: 0 } as MutableRefObject<number>;
  const onPositionsChange = vi.fn();

  const setPositions = vi.fn<Dispatch<SetStateAction<Map<string, number>>>>((update) => {
    const next = typeof update === 'function'
      ? (update as (current: Map<string, number>) => Map<string, number>)(new Map(positionsRef.current))
      : update;
    positionsRef.current = new Map(next);
  });

  return {
    params: {
      shotId: options?.shotId ?? 'shot-1',
      shotGenerations: options?.shotGenerations ?? [
        createGeneration('img-1', 0),
        createGeneration('img-2', 10, { end_frame: 18 }),
      ],
      onPositionsChange,
      setPositions,
      positionsRef,
      pendingUpdatesRef,
      lastSyncRef,
      isLockedRef,
      isUpdatingRef,
      writeInFlightRef,
    },
    positionsRef,
    pendingUpdatesRef,
    lastSyncRef,
    setPositions,
    onPositionsChange,
  };
}

describe('useTimelinePositionSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isTimelineWriteActive.mockReturnValue(false);
  });

  it('syncs merged server positions once and skips unchanged repeats', () => {
    const harness = createHarness();

    const { result } = renderHook(() => useTimelinePositionSync(harness.params));

    const expected = new Map([
      ['img-1', 4],
      ['img-2', 10],
      [TRAILING_ENDPOINT_KEY, 18],
    ]);

    expect(harness.positionsRef.current).toEqual(expected);
    expect(harness.setPositions).toHaveBeenCalledTimes(1);
    expect(harness.onPositionsChange).toHaveBeenCalledWith(expected);
    expect(Array.from(harness.pendingUpdatesRef.current.keys())).toEqual(['img-1']);

    harness.setPositions.mockClear();
    harness.onPositionsChange.mockClear();

    act(() => {
      result.current();
    });

    expect(harness.setPositions).not.toHaveBeenCalled();
    expect(harness.onPositionsChange).not.toHaveBeenCalled();
  });

  it('suppresses syncing while a serialized timeline write is active', () => {
    mocks.isTimelineWriteActive.mockReturnValue(true);
    const harness = createHarness({
      initialPositions: [['img-1', 0]],
    });

    renderHook(() => useTimelinePositionSync(harness.params));

    expect(harness.setPositions).not.toHaveBeenCalled();
    expect(harness.onPositionsChange).not.toHaveBeenCalled();
  });
});
