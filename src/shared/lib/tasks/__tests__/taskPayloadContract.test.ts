import { describe, expect, it } from 'vitest';
import { ORCHESTRATION_CONTRACT_VERSION } from '../orchestrationContract';
import { TASK_VIEW_CONTRACT_VERSION } from '../taskViewContract';
import {
  TASK_PAYLOAD_CONTRACT_VERSION,
  buildTaskPayloadContract,
  composeTaskFamilyPayload,
  composeTaskPayload,
} from '../taskPayloadContract';

describe('taskPayloadContract', () => {
  it('builds canonical task payload contracts', () => {
    const contract = buildTaskPayloadContract({
      taskFamily: 'join_clips',
      orchestratorDetails: { prompt: 'hello' },
      orchestrationContract: {
        contract_version: ORCHESTRATION_CONTRACT_VERSION,
        task_family: 'join_clips',
        run_id: 'run-1',
      },
      taskViewContract: {
        contract_version: TASK_VIEW_CONTRACT_VERSION,
        input_images: ['a.png'],
      },
      familyContract: {
        contract_version: 1,
        mode: 'legacy_join' as const,
      },
    });

    expect(contract.contract_version).toBe(TASK_PAYLOAD_CONTRACT_VERSION);
    expect(contract.task_family).toBe('join_clips');
    expect(contract.orchestrator_details).toEqual({ prompt: 'hello' });
    expect(contract.orchestration_contract.run_id).toBe('run-1');
    expect(contract.task_view_contract.input_images).toEqual(['a.png']);
    expect(contract.family_contract.mode).toBe('legacy_join');
  });

  it('composes payload while preserving top-level orchestrator details', () => {
    const payload = composeTaskPayload({
      taskFamily: 'travel_between_images',
      orchestratorDetails: { prompt: 'travel prompt', run_id: 'run-2' },
      orchestrationContract: {
        contract_version: ORCHESTRATION_CONTRACT_VERSION,
        task_family: 'travel_between_images',
      },
      taskViewContract: {
        contract_version: TASK_VIEW_CONTRACT_VERSION,
        input_images: ['i1.png', 'i2.png'],
      },
      familyContract: {
        contract_version: 1,
        segment_count: 1,
      },
    });

    expect(payload.prompt).toBe('travel prompt');
    expect(payload.run_id).toBe('run-2');
    expect(payload.task_family).toBe('travel_between_images');
  });

  it('builds family payload contracts from orchestration/task view inputs', () => {
    const payload = composeTaskFamilyPayload({
      taskFamily: 'individual_travel_segment',
      orchestratorDetails: { segment_index: 3, base_prompt: 'A -> B' },
      orchestrationInput: {
        taskFamily: 'individual_travel_segment',
        orchestratorTaskId: 'orch-1',
        runId: 'run-3',
        generationRouting: 'child_generation',
      },
      taskViewInput: {
        inputImages: ['start.png', '', 'end.png'],
        prompt: 'A -> B',
        modelName: 'wan2',
      },
      familyContract: {
        contract_version: 1,
        segment_regen_mode: 'segment_regen_from_order',
      },
    });

    expect(payload.orchestration_contract).toEqual(
      expect.objectContaining({
        contract_version: ORCHESTRATION_CONTRACT_VERSION,
        orchestrator_task_id: 'orch-1',
        run_id: 'run-3',
        generation_routing: 'child_generation',
      }),
    );
    expect(payload.task_view_contract).toEqual(
      expect.objectContaining({
        contract_version: TASK_VIEW_CONTRACT_VERSION,
        input_images: ['start.png', 'end.png'],
        prompt: 'A -> B',
        model_name: 'wan2',
      }),
    );
  });
});
