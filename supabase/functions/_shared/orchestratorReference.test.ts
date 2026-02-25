import { describe, expect, it } from 'vitest';
import {
  buildLegacyOrchestratorRefOrFilter,
  buildLegacyOrchestratorRunOrFilter,
  buildOrchestratorRefOrFilter,
  buildOrchestratorRunOrFilter,
  extractOrchestratorRefFromParams,
} from './orchestratorReference.ts';

describe('_shared/orchestratorReference', () => {
  it('prefers orchestration_contract orchestrator_task_id over legacy reference field', () => {
    expect(extractOrchestratorRefFromParams({
      orchestration_contract: {
        orchestrator_task_id: 'orch-contract',
      },
      orchestrator_task_id_ref: 'orch-legacy',
    })).toBe('orch-contract');
  });

  it('falls back to orchestrator_task_id_ref when contract is absent', () => {
    expect(extractOrchestratorRefFromParams({
      orchestrator_task_id_ref: 'orch-legacy',
    })).toBe('orch-legacy');
  });

  it('returns null for non-object params', () => {
    expect(extractOrchestratorRefFromParams(null)).toBeNull();
    expect(extractOrchestratorRefFromParams('x')).toBeNull();
    expect(extractOrchestratorRefFromParams([])).toBeNull();
  });

  it('builds canonical orchestrator reference OR filter', () => {
    const filter = buildOrchestratorRefOrFilter('orch-1');
    expect(filter).toBe(
      'params->orchestration_contract->>orchestrator_task_id.eq.orch-1,params->>orchestrator_task_id_ref.eq.orch-1',
    );
  });

  it('builds canonical run-id OR filter', () => {
    const filter = buildOrchestratorRunOrFilter('run-1');
    expect(filter).toBe('params->orchestration_contract->>run_id.eq.run-1');
  });

  it('builds legacy orchestrator and run-id fallback filters', () => {
    expect(buildLegacyOrchestratorRefOrFilter('orch-2')).toBe(
      'params->>orchestrator_task_id.eq.orch-2,params->orchestrator_details->>orchestrator_task_id.eq.orch-2',
    );
    expect(buildLegacyOrchestratorRunOrFilter('run-2')).toBe(
      'params->>orchestrator_run_id.eq.run-2,params->>run_id.eq.run-2,params->orchestrator_details->>run_id.eq.run-2',
    );
  });
});
