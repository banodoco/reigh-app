import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildIndividualTravelSegmentParams } from './segmentTaskPayload';

const mocks = vi.hoisted(() => ({
  buildIndividualSegmentFamilyContract: vi.fn(),
  composeTaskFamilyPayload: vi.fn(),
  buildTaskPayloadSnapshot: vi.fn(),
  resolveSnapshotOrchestratorTaskId: vi.fn(),
  resolveSnapshotRunId: vi.fn(),
  extractOrchestratorTaskIdParam: vi.fn(),
  extractRunIdParam: vi.fn(),
  buildSegmentState: vi.fn(),
}));

vi.mock('./core/taskFamilyContracts', () => ({
  buildIndividualSegmentFamilyContract: (...args: unknown[]) => mocks.buildIndividualSegmentFamilyContract(...args),
}));

vi.mock('./taskPayloadContract', () => ({
  composeTaskFamilyPayload: (...args: unknown[]) => mocks.composeTaskFamilyPayload(...args),
}));

vi.mock('./taskPayloadSnapshot', () => ({
  buildTaskPayloadSnapshot: (...args: unknown[]) => mocks.buildTaskPayloadSnapshot(...args),
  resolveSnapshotOrchestratorTaskId: (...args: unknown[]) => mocks.resolveSnapshotOrchestratorTaskId(...args),
  resolveSnapshotRunId: (...args: unknown[]) => mocks.resolveSnapshotRunId(...args),
}));

vi.mock('./taskParamContract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./taskParamContract')>();
  return {
    ...actual,
    extractOrchestratorTaskIdParam: (...args: unknown[]) => mocks.extractOrchestratorTaskIdParam(...args),
    extractRunIdParam: (...args: unknown[]) => mocks.extractRunIdParam(...args),
  };
});

vi.mock('./segmentStateResolvers', () => ({
  buildSegmentState: (...args: unknown[]) => mocks.buildSegmentState(...args),
}));

const phaseConfig = {
  num_phases: 2,
  steps_per_phase: [3, 3],
  flow_shift: 5,
  sample_solver: 'euler',
  model_switch_phase: 1,
  phases: [
    {
      phase: 1,
      guidance_scale: 1,
      loras: [],
    },
    {
      phase: 2,
      guidance_scale: 1,
      loras: [],
    },
  ],
};

describe('segmentTaskPayload', () => {
  beforeEach(() => {
    mocks.buildIndividualSegmentFamilyContract.mockReset();
    mocks.composeTaskFamilyPayload.mockReset();
    mocks.buildTaskPayloadSnapshot.mockReset();
    mocks.resolveSnapshotOrchestratorTaskId.mockReset();
    mocks.resolveSnapshotRunId.mockReset();
    mocks.extractOrchestratorTaskIdParam.mockReset();
    mocks.extractRunIdParam.mockReset();
    mocks.buildSegmentState.mockReset();

    mocks.composeTaskFamilyPayload.mockImplementation((input) => ({
      contract_version: 1,
      task_family: input.taskFamily,
      orchestration_contract: input.orchestrationInput,
      task_view_contract: input.taskViewInput,
      family_contract: input.familyContract,
      orchestrator_details: input.orchestratorDetails,
    }));
  });

  it('builds a variant-child payload with pair regeneration metadata and defaults make_primary_variant to true', () => {
    mocks.buildSegmentState.mockReturnValue({
      orig: {
        lora_names: ['style-a'],
        cfg_zero_step: 2,
        cfg_star_switch: 5,
        is_first_segment: false,
        is_last_segment: true,
        debug_mode_enabled: true,
        after_first_post_generation_saturation: 1.2,
        after_first_post_generation_brightness: 0.3,
      },
      orchDetails: {
        orchestrator_task_id: 'stale-orch-id',
        orchestrator_task_id_ref: 'remove-me',
        run_id: 'remove-me-too',
        use_svi: true,
        motion_mode: 'advanced',
        debug_mode_enabled: false,
        fps_helpers: 18,
        extra_field: 'keep-me',
      },
      inputImages: ['start.png', 'end.png'],
      allInputImages: ['start.png', 'end.png'],
      finalSeed: 999,
      additionalLoras: { 'style-a.safetensors': 0.8 },
      motionMode: 'advanced',
      amountOfMotion: 0.75,
      phaseConfig,
      advancedMode: true,
      loraMultipliers: [{ url: 'style-a.safetensors', multiplier: 0.8 }],
      modelName: 'wan-model',
      flowShift: 7,
      sampleSolver: 'heun',
      guidanceScale: 1.5,
      guidance2Scale: 1.7,
      guidancePhases: 3,
      numInferenceSteps: 12,
      modelSwitchPhase: 2,
      switchThreshold: 0.25,
      numFrames: 49,
      basePrompt: 'state prompt',
      negativePrompt: 'state negative',
      enhancedPrompt: 'state enhanced',
      fpsHelpers: 18,
      segmentFramesExpanded: [24, 25],
      frameOverlapExpanded: [5],
      structureGuidance: { videos: [{ path: 'clip.mp4' }] },
      structureVideos: [{ path: 'clip.mp4', start_frame: 0, end_frame: 10, treatment: 'adjust' }],
    });
    mocks.buildTaskPayloadSnapshot.mockReturnValue({ rawParams: { legacy: true } });
    mocks.resolveSnapshotOrchestratorTaskId.mockReturnValue(undefined);
    mocks.resolveSnapshotRunId.mockReturnValue('run-1');
    mocks.extractOrchestratorTaskIdParam.mockReturnValue('legacy-orch-id');
    mocks.extractRunIdParam.mockReturnValue('legacy-run-id');
    mocks.buildIndividualSegmentFamilyContract.mockReturnValue({ family: 'contract' });

    const result = buildIndividualTravelSegmentParams({
      project_id: 'project-1',
      shot_id: 'shot-1',
      parent_generation_id: 'parent-1',
      child_generation_id: 'child-1',
      segment_index: 2,
      start_image_url: 'start.png',
      end_image_url: 'end.png',
      start_image_generation_id: 'start-gen',
      end_image_generation_id: 'end-gen',
      pair_shot_generation_id: 'pair-1',
      start_image_variant_id: 'start-var',
      end_image_variant_id: 'end-var',
      selected_phase_preset_id: 'preset-1',
      generation_name: 'Segment 2',
      originalParams: { legacy: true },
    }, '1280x720');

    expect(mocks.buildIndividualSegmentFamilyContract).toHaveBeenCalledWith({
      segmentRegenerationMode: 'segment_regen_from_pair',
      generationRouting: 'variant_child',
      segmentIndex: 2,
      hasEndImage: true,
      hasPairShotGenerationId: true,
    });
    expect(mocks.composeTaskFamilyPayload).toHaveBeenCalledWith(expect.objectContaining({
      taskFamily: 'individual_travel_segment',
      orchestrationInput: expect.objectContaining({
        orchestratorTaskId: 'legacy-orch-id',
        runId: 'run-1',
        siblingLookup: 'run_id',
        generationRouting: 'variant_child',
        segmentRegenerationMode: 'segment_regen_from_pair',
      }),
      taskViewInput: {
        inputImages: ['start.png', 'end.png'],
        prompt: 'state prompt',
        enhancedPrompt: 'state enhanced',
        negativePrompt: 'state negative',
        modelName: 'wan-model',
        resolution: '1280x720',
      },
      familyContract: { family: 'contract' },
    }));
    expect(result.make_primary_variant).toBe(true);
    expect(result.orchestrator_details).toMatchObject({
      generation_source: 'individual_segment',
      parsed_resolution_wh: '1280x720',
      input_image_paths_resolved: ['start.png', 'end.png'],
      seed_base: 999,
      model_name: 'wan-model',
      motion_mode: 'advanced',
      amount_of_motion: 0.75,
      parent_generation_id: 'parent-1',
      phase_config: phaseConfig,
      extra_field: 'keep-me',
    });
    expect(result.orchestrator_details).not.toHaveProperty('run_id');
    expect(result.orchestrator_details).not.toHaveProperty('orchestrator_task_id');
    expect(result.orchestrator_details).not.toHaveProperty('use_svi');
    expect(result.individual_segment_params).toMatchObject({
      start_image_url: 'start.png',
      end_image_url: 'end.png',
      start_image_generation_id: 'start-gen',
      end_image_generation_id: 'end-gen',
      pair_shot_generation_id: 'pair-1',
      start_image_variant_id: 'start-var',
      end_image_variant_id: 'end-var',
      enhanced_prompt: 'state enhanced',
      selected_phase_preset_id: 'preset-1',
    });
  });

  it('falls back to orchestrator-task-id routing when no run id or pair ids are available', () => {
    mocks.buildSegmentState.mockReturnValue({
      orig: {},
      orchDetails: {
        orchestrator_task_id: 'orch-123',
        motion_mode: 'invalid',
      },
      inputImages: ['start.png'],
      allInputImages: ['start.png'],
      finalSeed: 111,
      additionalLoras: {},
      motionMode: 'basic',
      amountOfMotion: 0.5,
      phaseConfig,
      advancedMode: false,
      loraMultipliers: [],
      modelName: 'wan-model',
      flowShift: 5,
      sampleSolver: 'euler',
      guidanceScale: 1,
      guidance2Scale: 1,
      guidancePhases: 2,
      numInferenceSteps: 6,
      modelSwitchPhase: 1,
      switchThreshold: undefined,
      numFrames: 49,
      basePrompt: 'state prompt',
      negativePrompt: '',
      enhancedPrompt: undefined,
      fpsHelpers: 16,
      segmentFramesExpanded: undefined,
      frameOverlapExpanded: undefined,
      structureGuidance: undefined,
      structureVideos: undefined,
    });
    mocks.buildTaskPayloadSnapshot.mockReturnValue({ rawParams: { legacy: true } });
    mocks.resolveSnapshotOrchestratorTaskId.mockReturnValue(undefined);
    mocks.resolveSnapshotRunId.mockReturnValue(undefined);
    mocks.extractOrchestratorTaskIdParam.mockReturnValue(null);
    mocks.extractRunIdParam.mockReturnValue(null);
    mocks.buildIndividualSegmentFamilyContract.mockReturnValue({ family: 'contract' });

    const result = buildIndividualTravelSegmentParams({
      project_id: 'project-1',
      shot_id: 'shot-1',
      segment_index: 0,
      start_image_url: 'start.png',
      originalParams: { legacy: true },
      make_primary_variant: false,
    }, '1024x576');

    expect(mocks.buildIndividualSegmentFamilyContract).toHaveBeenCalledWith({
      segmentRegenerationMode: 'segment_regen_from_order',
      generationRouting: 'child_generation',
      segmentIndex: 0,
      hasEndImage: false,
      hasPairShotGenerationId: false,
    });
    expect(mocks.composeTaskFamilyPayload).toHaveBeenCalledWith(expect.objectContaining({
      orchestrationInput: expect.objectContaining({
        orchestratorTaskId: 'orch-123',
        runId: undefined,
        siblingLookup: 'orchestrator_task_id',
        generationRouting: 'child_generation',
        segmentRegenerationMode: 'segment_regen_from_order',
      }),
    }));
    expect(result.make_primary_variant).toBe(false);
  });
});
