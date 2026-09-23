import { describe, expect, it } from 'vitest';
import {
  applyClipEdgeMove,
  computeGroupEdgeResize,
  snapBoundaryToSiblings,
} from '@/tools/video-editor/lib/resize-math';

describe('computeGroupEdgeResize', () => {
  it('clamps the left edge at zero', () => {
    const result = computeGroupEdgeResize({
      dir: 'left',
      initial: { start: 2, end: 5 },
      proposedBoundary: -1,
      minimumDuration: 0.05,
    });

    expect(result.wasClamped).toBe(true);
    expect(result.start).toBe(0);
    expect(result.end).toBe(5);
  });

  it('enforces minimum duration on both directions', () => {
    const left = computeGroupEdgeResize({
      dir: 'left',
      initial: { start: 2, end: 5 },
      proposedBoundary: 4.99,
      minimumDuration: 0.5,
    });
    const right = computeGroupEdgeResize({
      dir: 'right',
      initial: { start: 2, end: 5 },
      proposedBoundary: 2.01,
      minimumDuration: 0.5,
    });

    expect(left.start).toBeCloseTo(4.5, 5);
    expect(left.end).toBe(5);
    expect(right.start).toBe(2);
    expect(right.end).toBeCloseTo(2.5, 5);
  });

  it('changes duration symmetrically for equivalent left and right proposals', () => {
    const left = computeGroupEdgeResize({
      dir: 'left',
      initial: { start: 10, end: 20 },
      proposedBoundary: 12,
      minimumDuration: 0.05,
    });
    const right = computeGroupEdgeResize({
      dir: 'right',
      initial: { start: 10, end: 20 },
      proposedBoundary: 18,
      minimumDuration: 0.05,
    });

    expect(left.end - left.start).toBeCloseTo(8, 5);
    expect(right.end - right.start).toBeCloseTo(8, 5);
  });
});

describe('applyClipEdgeMove', () => {
  it('returns a single updated clip for free resize and enforces maxEnd clamps', () => {
    const result = applyClipEdgeMove({
      kind: 'free',
      clipId: 'clip-a',
      initialStart: 1,
      initialEnd: 4,
      maxEnd: 4.5,
    }, 'right', 6);

    expect(result.wasClamped).toBe(true);
    expect(result.updates).toEqual([
      { clipId: 'clip-a', start: 1, end: 4.5 },
    ]);
  });

  it('returns updates for all clips in group when resizing right edge of middle clip', () => {
    const result = applyClipEdgeMove({
      kind: 'group',
      shotId: 'shot-1',
      trackId: 'row-1',
      draggedClipId: 'clip-a',
      draggedIndex: 0,
      groupClipIds: ['clip-a', 'clip-b'],
      groupChildrenSnapshot: [
        { clipId: 'clip-a', start: 1, end: 2 },
        { clipId: 'clip-b', start: 2, end: 3 },
      ],
    }, 'right', 2.25);

    expect(result.wasClamped).toBe(false);
    expect(result.updates).toEqual([
      { clipId: 'clip-a', start: 1, end: 2.25 },
      { clipId: 'clip-b', start: 2.25, end: 3.25 },
    ]);
  });

  it('group left edge resize shifts earlier clips by delta', () => {
    const result = applyClipEdgeMove({
      kind: 'group',
      shotId: 'shot-1',
      trackId: 'row-1',
      draggedClipId: 'clip-a',
      draggedIndex: 0,
      groupClipIds: ['clip-a', 'clip-b'],
      groupChildrenSnapshot: [
        { clipId: 'clip-a', start: 10, end: 13 },
        { clipId: 'clip-b', start: 13, end: 20 },
      ],
    }, 'left', 8);

    expect(result.wasClamped).toBe(false);
    expect(result.updates).toEqual([
      { clipId: 'clip-a', start: 8, end: 13 },
      { clipId: 'clip-b', start: 13, end: 20 },
    ]);
  });

  it('group right edge resize on last clip shifts nothing after', () => {
    const result = applyClipEdgeMove({
      kind: 'group',
      shotId: 'shot-1',
      trackId: 'row-1',
      draggedClipId: 'clip-c',
      draggedIndex: 2,
      groupClipIds: ['clip-a', 'clip-b', 'clip-c'],
      groupChildrenSnapshot: [
        { clipId: 'clip-a', start: 10, end: 13 },
        { clipId: 'clip-b', start: 13, end: 16 },
        { clipId: 'clip-c', start: 16, end: 20 },
      ],
    }, 'right', 22);

    expect(result.wasClamped).toBe(false);
    expect(result.updates).toEqual([
      { clipId: 'clip-a', start: 10, end: 13 },
      { clipId: 'clip-b', start: 13, end: 16 },
      { clipId: 'clip-c', start: 16, end: 22 },
    ]);
  });

  it('group resize clamps dragged clip to minimum duration', () => {
    const result = applyClipEdgeMove({
      kind: 'group',
      shotId: 'shot-1',
      trackId: 'row-1',
      draggedClipId: 'clip-b',
      draggedIndex: 1,
      groupClipIds: ['clip-a', 'clip-b'],
      groupChildrenSnapshot: [
        { clipId: 'clip-a', start: 10, end: 11 },
        { clipId: 'clip-b', start: 11, end: 12 },
      ],
    }, 'left', 11.99);

    // Clamped: min(12 - 0.05, 11.99) = 11.95
    // Delta = 11.95 - 11 = 0.95
    // clip-a (before dragged) shifts by delta: [10.95, 11.95]
    expect(result.wasClamped).toBe(true);
    expect(result.updates).toHaveLength(2);
    expect(result.updates[0].clipId).toBe('clip-a');
    expect(result.updates[0].start).toBeCloseTo(10.95, 5);
    expect(result.updates[0].end).toBeCloseTo(11.95, 5);
    expect(result.updates[1].clipId).toBe('clip-b');
    expect(result.updates[1].start).toBeCloseTo(11.95, 5);
    expect(result.updates[1].end).toBe(12);
  });

  it('group resize of interior clip right edge pushes subsequent clips', () => {
    const result = applyClipEdgeMove({
      kind: 'group',
      shotId: 'shot-1',
      trackId: 'row-1',
      draggedClipId: 'clip-b',
      draggedIndex: 1,
      groupClipIds: ['clip-a', 'clip-b', 'clip-c'],
      groupChildrenSnapshot: [
        { clipId: 'clip-a', start: 0, end: 1 },
        { clipId: 'clip-b', start: 1, end: 2 },
        { clipId: 'clip-c', start: 2, end: 3 },
      ],
    }, 'right', 2.5);

    expect(result.wasClamped).toBe(false);
    expect(result.updates).toEqual([
      { clipId: 'clip-a', start: 0, end: 1 },
      { clipId: 'clip-b', start: 1, end: 2.5 },
      { clipId: 'clip-c', start: 2.5, end: 3.5 },
    ]);
  });

  it('keeps a grouped right-edge resize within the hard shot stop', () => {
    const result = applyClipEdgeMove({
      kind: 'group',
      shotId: 'shot-1',
      trackId: 'row-1',
      draggedClipId: 'clip-b',
      draggedIndex: 1,
      groupClipIds: ['clip-a', 'clip-b', 'clip-c'],
      groupChildrenSnapshot: [
        { clipId: 'clip-a', start: 0, end: 1 },
        { clipId: 'clip-b', start: 1, end: 2 },
        { clipId: 'clip-c', start: 2, end: 3 },
      ],
      hardDurationSeconds: 3.25,
    }, 'right', 2.8);

    expect(result.wasClamped).toBe(true);
    expect(result.updates).toEqual([
      { clipId: 'clip-a', start: 0, end: 1 },
      { clipId: 'clip-b', start: 1, end: 2.25 },
      { clipId: 'clip-c', start: 2.25, end: 3.25 },
    ]);
  });
});

describe('snapBoundaryToSiblings', () => {
  it('snaps to the nearest sibling boundary within the threshold', () => {
    expect(snapBoundaryToSiblings(4.92, [2, 5, 9], 0.1)).toBe(5);
  });

  it('keeps the original boundary when no sibling is close enough', () => {
    expect(snapBoundaryToSiblings(4.92, [2, 5, 9], 0.05)).toBe(4.92);
  });
});
