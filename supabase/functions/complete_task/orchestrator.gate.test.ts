import { describe, expect, it } from 'vitest';
import { evaluateSegmentCompletionGate } from './orchestrator.ts';

describe('evaluateSegmentCompletionGate', () => {
  it('returns ready when segment set is a superset of expected count', () => {
    const gate = evaluateSegmentCompletionGate(2, {
      foundSegments: 3,
      completedSegments: 3,
      failedSegments: 0,
      pendingSegments: 0,
    });

    expect(gate).toEqual({ kind: 'ready' });
  });

  it('returns fail when expected segments are missing with no pending work', () => {
    const gate = evaluateSegmentCompletionGate(3, {
      foundSegments: 2,
      completedSegments: 2,
      failedSegments: 0,
      pendingSegments: 0,
    });

    expect(gate).toEqual({
      kind: 'fail',
      reason: 'missing_segments',
      expectedSegments: 3,
      foundSegments: 2,
    });
  });

  it('keeps waiting while pending segments still exist', () => {
    const gate = evaluateSegmentCompletionGate(3, {
      foundSegments: 2,
      completedSegments: 1,
      failedSegments: 0,
      pendingSegments: 1,
    });

    expect(gate).toEqual({
      kind: 'wait',
      reason: 'segments_pending',
    });
  });
});
