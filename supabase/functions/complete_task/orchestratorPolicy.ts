import { TASK_TYPES } from './constants.ts';
import {
  asObjectOrEmpty,
  parseNonNegativeIntCandidate,
} from '../_shared/payloadNormalization.ts';
import { isFailureStatus } from '../_shared/taskStatusSemantics.ts';
import type { CostCalculationTriggerResult } from './billing.ts';

export interface SegmentTaskStatus {
  status: string;
}

export interface SegmentCompletionStats {
  foundSegments: number;
  completedSegments: number;
  failedSegments: number;
  pendingSegments: number;
}

export type SegmentCompletionGate =
  | { kind: 'wait'; reason: 'no_segments' | 'segments_pending' }
  | { kind: 'fail'; reason: 'segments_failed'; failedSegments: number; foundSegments: number }
  | { kind: 'fail'; reason: 'missing_segments'; expectedSegments: number; foundSegments: number }
  | { kind: 'ready' };

export type BillingOutcomeStatus =
  | 'recorded'
  | 'skipped'
  | 'recoverable_failure'
  | 'nonrecoverable_failure';

export interface BillingPolicyDecision {
  status: BillingOutcomeStatus;
  reconciliationRequired: boolean;
  retryRecommended: boolean;
}

export interface ExpectedSegmentCountResolution {
  value: number | null;
  invalid: boolean;
  source?: string;
  raw?: unknown;
}

export function classifyBillingOutcome(
  billingResult: CostCalculationTriggerResult,
): BillingPolicyDecision {
  if (billingResult.ok) {
    if (billingResult.value.skipped) {
      return {
        status: 'skipped',
        reconciliationRequired: false,
        retryRecommended: false,
      };
    }
    return {
      status: 'recorded',
      reconciliationRequired: false,
      retryRecommended: false,
    };
  }

  if (billingResult.recoverable === true) {
    return {
      status: 'recoverable_failure',
      reconciliationRequired: true,
      retryRecommended: true,
    };
  }

  return {
    status: 'nonrecoverable_failure',
    reconciliationRequired: true,
    retryRecommended: false,
  };
}

export function buildBillingOutcome(
  billingResult: CostCalculationTriggerResult,
  decision: BillingPolicyDecision,
): Record<string, unknown> {
  const recordedAt = new Date().toISOString();
  const successValue = billingResult.ok ? billingResult.value : null;
  return {
    source: 'orchestrator_complete',
    status: decision.status,
    skipped: successValue?.skipped === true,
    recoverable: billingResult.ok ? false : billingResult.recoverable === true,
    retry_recommended: decision.retryRecommended,
    reconciliation_required: decision.reconciliationRequired,
    http_status: successValue?.status ?? null,
    error_code: billingResult.ok ? null : billingResult.errorCode,
    message: billingResult.ok ? null : billingResult.message,
    cost: successValue?.cost,
    recorded_at: recordedAt,
  };
}

export function buildBillingReconciliation(
  decision: BillingPolicyDecision,
): Record<string, unknown> {
  if (!decision.reconciliationRequired) {
    return {
      required: false,
      retry_recommended: false,
      reason: null,
      updated_at: new Date().toISOString(),
    };
  }

  return {
    required: true,
    retry_recommended: decision.retryRecommended,
    reason: decision.status,
    updated_at: new Date().toISOString(),
  };
}

export function resolveExpectedSegmentCount(
  taskType: string,
  orchestratorParams: Record<string, unknown>,
): ExpectedSegmentCountResolution {
  const orchestratorDetails = asObjectOrEmpty(orchestratorParams.orchestrator_details);

  const resolveFromCandidate = (
    value: unknown,
    source: string,
  ): ExpectedSegmentCountResolution | null => {
    const parsed = parseNonNegativeIntCandidate(value);
    if (parsed.invalid) {
      return {
        value: null,
        invalid: true,
        source,
        raw: value,
      };
    }
    if (parsed.value !== null) {
      return {
        value: parsed.value,
        invalid: false,
        source,
        raw: value,
      };
    }
    return null;
  };

  if (taskType === TASK_TYPES.TRAVEL_SEGMENT) {
    return (
      resolveFromCandidate(
        orchestratorDetails.num_new_segments_to_generate,
        'orchestrator_details.num_new_segments_to_generate',
      )
      || resolveFromCandidate(
        orchestratorParams.num_new_segments_to_generate,
        'num_new_segments_to_generate',
      )
      || { value: null, invalid: false }
    );
  }

  if (taskType === TASK_TYPES.JOIN_CLIPS_SEGMENT) {
    const clipList = orchestratorDetails.clip_list;
    if (Array.isArray(clipList) && clipList.length > 1) {
      return {
        value: clipList.length - 1,
        invalid: false,
        source: 'orchestrator_details.clip_list',
        raw: clipList.length,
      };
    }
    return (
      resolveFromCandidate(
        orchestratorDetails.num_joins,
        'orchestrator_details.num_joins',
      )
      || { value: null, invalid: false }
    );
  }

  return { value: null, invalid: false };
}

export function summarizeSegmentCompletion(
  allSegments: SegmentTaskStatus[],
): SegmentCompletionStats {
  const foundSegments = allSegments.length;
  const completedSegments = allSegments.filter((segment) => segment.status === 'Complete').length;
  const failedSegments = allSegments.filter((segment) => isFailureStatus(segment.status)).length;
  const pendingSegments = foundSegments - completedSegments - failedSegments;

  return {
    foundSegments,
    completedSegments,
    failedSegments,
    pendingSegments,
  };
}

export function evaluateSegmentCompletionGate(
  expectedSegmentCount: number | null,
  stats: SegmentCompletionStats,
): SegmentCompletionGate {
  if (stats.foundSegments === 0) {
    return { kind: 'wait', reason: 'no_segments' };
  }

  if (stats.pendingSegments > 0) {
    return { kind: 'wait', reason: 'segments_pending' };
  }

  if (stats.failedSegments > 0) {
    return {
      kind: 'fail',
      reason: 'segments_failed',
      failedSegments: stats.failedSegments,
      foundSegments: stats.foundSegments,
    };
  }

  if (expectedSegmentCount !== null && stats.foundSegments < expectedSegmentCount) {
    return {
      kind: 'fail',
      reason: 'missing_segments',
      expectedSegments: expectedSegmentCount,
      foundSegments: stats.foundSegments,
    };
  }

  return { kind: 'ready' };
}
