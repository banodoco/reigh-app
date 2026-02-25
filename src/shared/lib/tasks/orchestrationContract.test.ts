import { describe, expect, it } from 'vitest';
import {
  buildOrchestrationContract,
  ORCHESTRATION_CONTRACT_VERSION,
} from './orchestrationContract';

describe('buildOrchestrationContract', () => {
  it('builds required fields and maps optional values to snake_case', () => {
    const contract = buildOrchestrationContract({
      taskFamily: 'travel_between_images',
      orchestratorTaskId: 'task-1',
      runId: 'run-1',
      parentGenerationId: 'parent-1',
      childGenerationId: 'child-1',
      childOrder: 0,
      shotId: 'shot-1',
      basedOn: 'gen-1',
      createAsGeneration: false,
      generationRouting: 'variant_child',
      siblingLookup: 'run_id',
      segmentRegenerationMode: 'segment_regen_from_pair',
    });

    expect(contract).toEqual({
      contract_version: ORCHESTRATION_CONTRACT_VERSION,
      task_family: 'travel_between_images',
      orchestrator_task_id: 'task-1',
      run_id: 'run-1',
      parent_generation_id: 'parent-1',
      child_generation_id: 'child-1',
      child_order: 0,
      shot_id: 'shot-1',
      based_on: 'gen-1',
      create_as_generation: false,
      generation_routing: 'variant_child',
      sibling_lookup: 'run_id',
      segment_regen_mode: 'segment_regen_from_pair',
    });
  });

  it('omits undefined optional fields', () => {
    const contract = buildOrchestrationContract({
      taskFamily: 'join_clips',
    });

    expect(contract).toEqual({
      contract_version: ORCHESTRATION_CONTRACT_VERSION,
      task_family: 'join_clips',
    });
  });
});
