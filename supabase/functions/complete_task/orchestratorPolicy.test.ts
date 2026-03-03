import { describe, expect, it } from 'vitest';
import {
  buildBillingOutcome,
  buildBillingReconciliation,
  classifyBillingOutcome,
  evaluateSegmentCompletionGate,
  resolveExpectedSegmentCount,
  summarizeSegmentCompletion,
} from './orchestratorPolicy.ts';
import { TASK_TYPES } from './constants.ts';

describe('orchestratorPolicy', () => {
  it('classifies billing outcomes across success and failure modes', () => {
    const recorded = classifyBillingOutcome({ ok: true, value: { skipped: false } });
    const skipped = classifyBillingOutcome({ ok: true, value: { skipped: true } });
    const recoverable = classifyBillingOutcome({ ok: false, recoverable: true, errorCode: 'x', message: 'm' });
    const nonRecoverable = classifyBillingOutcome({ ok: false, recoverable: false, errorCode: 'x', message: 'm' });

    expect(recorded.status).toBe('recorded');
    expect(skipped.status).toBe('skipped');
    expect(recoverable.status).toBe('recoverable_failure');
    expect(nonRecoverable.status).toBe('nonrecoverable_failure');
  });

  it('builds billing outcome and reconciliation payloads', () => {
    const decision = classifyBillingOutcome({ ok: false, recoverable: true, errorCode: 'billing_failed', message: 'retry' });
    const outcome = buildBillingOutcome(
      { ok: false, recoverable: true, errorCode: 'billing_failed', message: 'retry' },
      decision,
    );
    const reconciliation = buildBillingReconciliation(decision);

    expect(outcome.status).toBe('recoverable_failure');
    expect(outcome.retry_recommended).toBe(true);
    expect(reconciliation).toMatchObject({
      required: true,
      retry_recommended: true,
      reason: 'recoverable_failure',
    });
  });

  it('resolves expected segment counts for travel and join-clips task types', () => {
    const travel = resolveExpectedSegmentCount(TASK_TYPES.TRAVEL_SEGMENT, {
      orchestrator_details: {
        num_new_segments_to_generate: 4,
      },
    });
    const joinClips = resolveExpectedSegmentCount(TASK_TYPES.JOIN_CLIPS_SEGMENT, {
      orchestrator_details: {
        clip_list: ['a', 'b', 'c'],
      },
    });

    expect(travel.value).toBe(4);
    expect(joinClips.value).toBe(2);
  });

  it('summarizes and evaluates segment completion gates', () => {
    const stats = summarizeSegmentCompletion([
      { status: 'Complete' },
      { status: 'Queued' },
      { status: 'Failed' },
    ]);

    expect(stats).toMatchObject({
      foundSegments: 3,
      completedSegments: 1,
      failedSegments: 1,
      pendingSegments: 1,
    });

    const gatePending = evaluateSegmentCompletionGate(3, stats);
    const gateMissing = evaluateSegmentCompletionGate(4, {
      foundSegments: 3,
      completedSegments: 3,
      failedSegments: 0,
      pendingSegments: 0,
    });

    expect(gatePending).toEqual({ kind: 'wait', reason: 'segments_pending' });
    expect(gateMissing).toEqual({
      kind: 'fail',
      reason: 'missing_segments',
      expectedSegments: 4,
      foundSegments: 3,
    });
  });
});
