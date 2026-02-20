import { describe, expect, it } from 'vitest';
import {
  UUID_REGEX,
  extractOrchestratorRef,
  getSubTaskOrchestratorId,
  buildSubTaskFilter,
} from './billing.ts';

describe('_shared/billing', () => {
  it('extracts orchestrator references from known param shapes', () => {
    expect(extractOrchestratorRef({ orchestrator_task_id_ref: 'abc' })).toBe('abc');
    expect(extractOrchestratorRef({ orchestrator_details: { orchestrator_task_id: 'def' } })).toBe('def');
  });

  it('detects valid sub-task orchestrator IDs', () => {
    const orchestratorId = '11111111-2222-3333-4444-555555555555';
    expect(UUID_REGEX.test(orchestratorId)).toBe(true);
    expect(getSubTaskOrchestratorId({ orchestrator_task_id_ref: orchestratorId }, 'task-self')).toBe(orchestratorId);
    expect(getSubTaskOrchestratorId({ orchestrator_task_id_ref: orchestratorId }, orchestratorId)).toBeNull();
  });

  it('builds OR filter across all supported JSON paths', () => {
    const filter = buildSubTaskFilter('orch-id');
    expect(filter).toContain('params->>orchestrator_task_id_ref.eq.orch-id');
    expect(filter).toContain('params->orchestrator_details->>orchestrator_task_id.eq.orch-id');
  });
});
