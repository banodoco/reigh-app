import { describe, expect, it } from 'vitest';
import {
  buildTaskPayloadSnapshot,
  resolveSnapshotOrchestratorTaskId,
  resolveSnapshotRunId,
} from '../taskPayloadSnapshot';

describe('taskPayloadSnapshot', () => {
  it('falls back orchestratorDetails to full_orchestrator_payload when direct details are missing', () => {
    const snapshot = buildTaskPayloadSnapshot({
      full_orchestrator_payload: {
        run_id: 'run-fallback',
        orchestrator_task_id: 'orch-fallback',
      },
    });

    expect(snapshot.orchestratorDetails).toEqual({
      run_id: 'run-fallback',
      orchestrator_task_id: 'orch-fallback',
    });
  });

  it('prefers orchestration contract for orchestrator_task_id before legacy fields', () => {
    const snapshot = buildTaskPayloadSnapshot({
      orchestration_contract: {
        orchestrator_task_id: 'orch-contract',
      },
      orchestrator_task_id_ref: 'orch-ref',
      orchestrator_details: {
        orchestrator_task_id: 'orch-details',
      },
    });

    expect(resolveSnapshotOrchestratorTaskId(snapshot)).toBe('orch-contract');
  });

  it('resolves run_id across contract -> details -> raw fallback order', () => {
    expect(resolveSnapshotRunId(buildTaskPayloadSnapshot({
      orchestration_contract: { run_id: 'run-contract' },
      orchestrator_details: { run_id: 'run-details' },
      run_id: 'run-raw',
    }))).toBe('run-contract');

    expect(resolveSnapshotRunId(buildTaskPayloadSnapshot({
      orchestrator_details: { run_id: 'run-details' },
      run_id: 'run-raw',
    }))).toBe('run-details');

    expect(resolveSnapshotRunId(buildTaskPayloadSnapshot({
      run_id: 'run-raw',
    }))).toBe('run-raw');
  });
});
