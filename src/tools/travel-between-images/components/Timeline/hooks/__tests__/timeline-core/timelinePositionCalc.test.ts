import { describe, expect, it } from 'vitest';
import { TRAILING_ENDPOINT_KEY } from '../../../utils/timeline-utils';
import {
  buildServerPositions,
  createPositionsSyncKey,
  detectPositionChanges,
  hasDuplicatePositionValues,
  mergePendingUpdates,
  type PendingUpdate,
} from '../../timeline-core/timelinePositionCalc';

describe('timelinePositionCalc', () => {
  it('builds server positions and appends trailing endpoint when metadata has end_frame', () => {
    const shotGenerations = [
      { id: 'gen-1', timeline_frame: 0, metadata: null },
      { id: 'gen-2', timeline_frame: 25, metadata: { end_frame: 40 } },
      { id: 'gen-3', timeline_frame: -1, metadata: null },
    ] as Array<{ id: string; timeline_frame: number | null; metadata: unknown }>;

    const positions = buildServerPositions(shotGenerations as never);

    expect(positions.get('gen-1')).toBe(0);
    expect(positions.get('gen-2')).toBe(25);
    expect(positions.has('gen-3')).toBe(false);
    expect(positions.get(TRAILING_ENDPOINT_KEY)).toBe(40);
  });

  it('merges pending updates and clears resolved or stale ids', () => {
    const now = 100_000;
    const server = new Map<string, number>([
      ['a', 10],
      ['b', 20],
    ]);
    const pending = new Map<string, PendingUpdate>([
      ['a', { id: 'a', oldPosition: 5, newPosition: 10, operation: 'move', timestamp: now - 1_000 }],
      ['b', { id: 'b', oldPosition: 30, newPosition: 35, operation: 'move', timestamp: now - 40_000 }],
      ['c', { id: 'c', oldPosition: null, newPosition: 50, operation: 'add', timestamp: now - 1_000 }],
      ['d', { id: 'd', oldPosition: 60, newPosition: 70, operation: 'remove', timestamp: now - 1_000 }],
    ]);

    const { merged, idsToClear } = mergePendingUpdates(server, pending, now);

    expect(idsToClear.sort()).toEqual(['a', 'b']);
    expect(merged.get('a')).toBe(10);
    expect(merged.get('b')).toBe(20);
    expect(merged.get('c')).toBe(50);
    expect(merged.has('d')).toBe(false);
  });

  it('creates deterministic keys and detects changes/duplicate values', () => {
    const base = new Map<string, number>([
      ['b', 20],
      ['a', 10],
    ]);
    const next = new Map<string, number>([
      ['a', 10],
      ['b', 25],
      ['c', 30],
    ]);

    expect(createPositionsSyncKey(base)).toBe('[["a",10],["b",20]]');
    expect(detectPositionChanges(base, next)).toEqual([
      { id: 'b', oldPos: 20, newPos: 25 },
      { id: 'c', oldPos: null, newPos: 30 },
    ]);
    expect(hasDuplicatePositionValues(new Map([['x', 1], ['y', 1]]))).toBe(true);
    expect(hasDuplicatePositionValues(new Map([['x', 1], ['y', 2]]))).toBe(false);
  });
});
