import { describe, it, expect } from 'vitest';
import {
  findGeneration,
  calculateDistributedFrames,
  deduplicateUpdates,
  buildAndNormalizeFinalPositions,
} from '../timelineFrameCalculators';
import type { ShotGeneration } from '@/shared/hooks/timeline/useTimelineCore';

// Helper to create a minimal ShotGeneration
function createShotGen(id: string, genId: string, frame: number): ShotGeneration {
  return {
    id,
    shot_id: 'shot-1',
    generation_id: genId,
    timeline_frame: frame,
  };
}

describe('findGeneration', () => {
  const shotGenerations: ShotGeneration[] = [
    createShotGen('sg-1', 'gen-1', 0),
    createShotGen('sg-2', 'gen-2', 50),
    createShotGen('sg-3', 'gen-3', 100),
  ];

  it('finds by shot_generation id', () => {
    expect(findGeneration(shotGenerations, 'sg-2')).toEqual(shotGenerations[1]);
  });

  it('does not match generation_id aliases', () => {
    expect(findGeneration(shotGenerations, 'gen-3')).toBeUndefined();
  });

  it('returns undefined for non-existent key', () => {
    expect(findGeneration(shotGenerations, 'nonexistent')).toBeUndefined();
  });

  it('returns undefined for null key', () => {
    expect(findGeneration(shotGenerations, null)).toBeUndefined();
  });

  it('returns undefined for undefined key', () => {
    expect(findGeneration(shotGenerations, undefined)).toBeUndefined();
  });
});

describe('deduplicateUpdates', () => {
  it('keeps last update for duplicate ids', () => {
    const updates = [
      { id: 'sg-1', newFrame: 0, reason: 'first' },
      { id: 'sg-1', newFrame: 50, reason: 'second' },
      { id: 'sg-2', newFrame: 100, reason: 'only' },
    ];

    const result = deduplicateUpdates(updates);

    expect(result.size).toBe(2);
    expect(result.get('sg-1')!.newFrame).toBe(50);
    expect(result.get('sg-1')!.reason).toBe('second');
    expect(result.get('sg-2')!.newFrame).toBe(100);
  });

  it('handles empty updates', () => {
    const result = deduplicateUpdates([]);
    expect(result.size).toBe(0);
  });

  it('keeps same-frame entries (no duplicates)', () => {
    const updates = [
      { id: 'sg-1', newFrame: 50, reason: 'first' },
      { id: 'sg-1', newFrame: 50, reason: 'second' },
    ];

    const result = deduplicateUpdates(updates);
    expect(result.size).toBe(1);
    // When newFrame matches, existing is kept (no update needed)
    expect(result.get('sg-1')!.reason).toBe('first');
  });
});

describe('calculateDistributedFrames', () => {
  it('distributes items between predecessor and successor', () => {
    const shotGenerations: ShotGeneration[] = [
      createShotGen('sg-1', 'gen-1', 0),
      createShotGen('sg-2', 'gen-2', 50),
      createShotGen('sg-3', 'gen-3', 100),
    ];

    const allItems = [
      { id: 'sg-1', timeline_frame: 0 },
      { id: 'sg-2', timeline_frame: 50 }, // This is being moved
      { id: 'sg-3', timeline_frame: 100 },
    ];

    // Moving sg-2 to between sg-1 (index 0) and sg-3 (index 2)
    const result = calculateDistributedFrames({
      draggedShotGens: [shotGenerations[1]],
      draggedItemIds: ['sg-2'],
      newStartIndex: 1,
      allItems,
      shotGenerations,
    });

    expect(result.length).toBeGreaterThan(0);
    // Between 0 and 100, single item should be at midpoint ~50
    const frame = result[0].newFrame;
    expect(frame).toBeGreaterThan(0);
    expect(frame).toBeLessThan(100);
  });

  it('handles drop at position 0', () => {
    const shotGenerations: ShotGeneration[] = [
      createShotGen('sg-1', 'gen-1', 0),
      createShotGen('sg-2', 'gen-2', 50),
      createShotGen('sg-3', 'gen-3', 100),
    ];

    const allItems = [
      { id: 'sg-3', timeline_frame: 100 }, // dragged to front
      { id: 'sg-1', timeline_frame: 0 },   // displaced
      { id: 'sg-2', timeline_frame: 50 },
    ];

    const result = calculateDistributedFrames({
      draggedShotGens: [shotGenerations[2]],
      draggedItemIds: ['sg-3'],
      newStartIndex: 0,
      allItems,
      shotGenerations,
    });

    expect(result.length).toBeGreaterThan(0);
    // First dragged item should go to frame 0
    const firstItemUpdate = result.find(u => u.id === 'sg-3');
    expect(firstItemUpdate).toBeDefined();
    expect(firstItemUpdate!.newFrame).toBe(0);
  });

  it('extends timeline at the end using average spacing', () => {
    const shotGenerations: ShotGeneration[] = [
      createShotGen('sg-1', 'gen-1', 0),
      createShotGen('sg-2', 'gen-2', 50),
      createShotGen('sg-3', 'gen-3', 100),
    ];

    const allItems = [
      { id: 'sg-1', timeline_frame: 0 },
      { id: 'sg-2', timeline_frame: 50 },
      { id: 'sg-3', timeline_frame: 100 }, // dragged to end (index 2 = last)
    ];

    // Drop at the end - no successor
    const result = calculateDistributedFrames({
      draggedShotGens: [shotGenerations[2]],
      draggedItemIds: ['sg-3'],
      newStartIndex: 2,
      allItems,
      shotGenerations,
    });

    expect(result.length).toBeGreaterThan(0);
    // Should extend beyond the predecessor's frame
    const update = result[0];
    expect(update.newFrame).toBeGreaterThan(50);
  });

  it('handles multiple dragged items between bounds', () => {
    const shotGenerations: ShotGeneration[] = [
      createShotGen('sg-1', 'gen-1', 0),
      createShotGen('sg-2', 'gen-2', 50),
      createShotGen('sg-3', 'gen-3', 100),
      createShotGen('sg-4', 'gen-4', 150),
    ];

    const allItems = [
      { id: 'sg-1', timeline_frame: 0 },
      { id: 'sg-2', timeline_frame: 50 },
      { id: 'sg-3', timeline_frame: 100 },
      { id: 'sg-4', timeline_frame: 150 },
    ];

    // Dragging sg-2 and sg-3 to between sg-1 and sg-4 (indices 1..2)
    const result = calculateDistributedFrames({
      draggedShotGens: [shotGenerations[1], shotGenerations[2]],
      draggedItemIds: ['sg-2', 'sg-3'],
      newStartIndex: 1,
      allItems,
      shotGenerations,
    });

    expect(result.length).toBe(2);
    // Both should be between 0 and 150
    result.forEach(u => {
      expect(u.newFrame).toBeGreaterThan(0);
      expect(u.newFrame).toBeLessThan(150);
    });
    // Should be evenly distributed
    expect(result[0].newFrame).toBeLessThan(result[1].newFrame);
  });

  it('places first items at default spacing when no neighbors exist', () => {
    const shotGenerations: ShotGeneration[] = [
      createShotGen('sg-1', 'gen-1', -1),
      createShotGen('sg-2', 'gen-2', -1),
    ];

    const allItems = [
      { id: 'sg-1', timeline_frame: null },
      { id: 'sg-2', timeline_frame: null },
    ];

    const result = calculateDistributedFrames({
      draggedShotGens: shotGenerations,
      draggedItemIds: ['sg-1', 'sg-2'],
      newStartIndex: 0,
      allItems,
      shotGenerations,
    });

    expect(result.length).toBe(2);
    expect(result[0].newFrame).toBe(0);
    expect(result[1].newFrame).toBeGreaterThan(0);
  });
});

describe('buildAndNormalizeFinalPositions', () => {
  it('normalizes positions to start at 0', () => {
    const shotGenerations: ShotGeneration[] = [
      createShotGen('sg-1', 'gen-1', 100),
      createShotGen('sg-2', 'gen-2', 200),
    ];

    const updates = new Map<string, { newFrame: number; reason: string }>();
    // No explicit updates - just normalize current positions
    const result = buildAndNormalizeFinalPositions(updates, shotGenerations);

    // Should normalize sg-1 from 100 to 0
    expect(result.has('sg-1')).toBe(true);
    expect(result.get('sg-1')!.newFrame).toBe(0);
  });

  it('preserves relative ordering after normalization', () => {
    const shotGenerations: ShotGeneration[] = [
      createShotGen('sg-1', 'gen-1', 50),
      createShotGen('sg-2', 'gen-2', 100),
      createShotGen('sg-3', 'gen-3', 150),
    ];

    const updates = new Map<string, { newFrame: number; reason: string }>();
    const result = buildAndNormalizeFinalPositions(updates, shotGenerations);

    // Get all final frames
    const frames: number[] = [];
    for (const sg of shotGenerations) {
      const update = result.get(sg.id);
      frames.push(update ? update.newFrame : sg.timeline_frame);
    }

    // Should be in ascending order
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]).toBeGreaterThanOrEqual(frames[i - 1]);
    }
  });

  it('applies explicit updates before normalizing', () => {
    const shotGenerations: ShotGeneration[] = [
      createShotGen('sg-1', 'gen-1', 0),
      createShotGen('sg-2', 'gen-2', 50),
      createShotGen('sg-3', 'gen-3', 100),
    ];

    const updates = new Map<string, { newFrame: number; reason: string }>();
    // Move sg-3 to between sg-1 and sg-2
    updates.set('sg-3', { newFrame: 25, reason: 'moved' });

    const result = buildAndNormalizeFinalPositions(updates, shotGenerations);

    // sg-3 should end up between sg-1 and sg-2
    // After normalization, order should be sg-1, sg-3, sg-2
    const sg3Update = result.get('sg-3');
    expect(sg3Update).toBeDefined();
  });

  it('handles empty shot generations', () => {
    const updates = new Map<string, { newFrame: number; reason: string }>();
    const result = buildAndNormalizeFinalPositions(updates, []);
    expect(result.size).toBe(0);
  });

  it('skips items with null timeline_frame', () => {
    const shotGenerations: ShotGeneration[] = [
      createShotGen('sg-1', 'gen-1', 0),
      { ...createShotGen('sg-2', 'gen-2', 50), timeline_frame: null as unknown as number },
      createShotGen('sg-3', 'gen-3', 100),
    ];

    const updates = new Map<string, { newFrame: number; reason: string }>();
    const result = buildAndNormalizeFinalPositions(updates, shotGenerations);

    // sg-2 should not appear in results since it has null frame
    expect(result.has('sg-2')).toBe(false);
  });
});
