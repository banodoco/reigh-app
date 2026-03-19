import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSegmentState, MAX_SEGMENT_FRAMES } from './segmentStateResolvers';

const mocks = vi.hoisted(() => ({
  resolveSeed32Bit: vi.fn(),
  buildBasicModePhaseConfig: vi.fn(),
  buildTaskPayloadSnapshot: vi.fn(),
  readTravelContractData: vi.fn(),
}));

vi.mock('../taskCreation', () => ({
  resolveSeed32Bit: (...args: unknown[]) => mocks.resolveSeed32Bit(...args),
}));

vi.mock('@/shared/types/phaseConfig', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/types/phaseConfig')>();
  return {
    ...actual,
    buildBasicModePhaseConfig: (...args: unknown[]) => mocks.buildBasicModePhaseConfig(...args),
  };
});

vi.mock('./taskPayloadSnapshot', () => ({
  buildTaskPayloadSnapshot: (...args: unknown[]) => mocks.buildTaskPayloadSnapshot(...args),
}));

vi.mock('./travelContractData', () => ({
  readTravelContractData: (...args: unknown[]) => mocks.readTravelContractData(...args),
}));

const explicitPhaseConfig = {
  num_phases: 2,
  steps_per_phase: [4, 5],
  flow_shift: 6,
  sample_solver: 'heun',
  model_switch_phase: 1,
  phases: [
    {
      phase: 1,
      guidance_scale: 1.2,
      loras: [{ url: 'phase-1.safetensors', multiplier: '0.5' }],
    },
    {
      phase: 2,
      guidance_scale: 1.4,
      loras: [{ url: 'phase-2.safetensors', multiplier: '0.75' }],
    },
  ],
};

const fallbackPhaseConfig = {
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

describe('segmentStateResolvers', () => {
  beforeEach(() => {
    mocks.resolveSeed32Bit.mockReset();
    mocks.buildBasicModePhaseConfig.mockReset();
    mocks.buildTaskPayloadSnapshot.mockReset();
    mocks.readTravelContractData.mockReset();
  });

  it('prefers explicit params and contract data over raw snapshot fallbacks', () => {
    mocks.buildTaskPayloadSnapshot.mockReturnValue({
      rawParams: {
        seed_to_use: 321,
        flow_shift: 9,
        sample_solver: 'raw-solver',
        guidance_scale: 2.1,
        guidance2_scale: 2.2,
        guidance_phases: 4,
        num_inference_steps: 14,
        model_switch_phase: 3,
        switch_threshold: 0.25,
        num_frames: 120,
        prompt: 'raw prompt',
        additional_loras: { raw: 0.3 },
        fps_helpers: 20,
      },
      orchestratorDetails: {
        seed_base: 654,
        additional_loras: { orch: 0.7 },
        structure_videos: [{ path: 'orch-video.mp4', start_frame: 0, end_frame: 9 }],
      },
    });
    mocks.readTravelContractData.mockReturnValue({
      inputImages: ['contract-start.png', 'contract-end.png'],
      additionalLoras: { contract: 0.8 },
      motionMode: 'advanced',
      amountOfMotion: 0.7,
      phaseConfig: explicitPhaseConfig,
      advancedMode: false,
      modelName: 'ltx2_22B_distilled',
      prompt: 'contract prompt',
      negativePrompt: 'contract negative',
      enhancedPrompt: 'contract enhanced',
      segmentFramesExpanded: [24, 24],
      frameOverlapExpanded: [6],
      travelGuidance: {
        kind: 'vace',
        mode: 'raw',
        videos: [
          {
            path: 'contract-video.mp4',
            start_frame: 1,
            end_frame: 8,
            treatment: 'clip',
          },
        ],
      },
    });
    mocks.resolveSeed32Bit.mockReturnValue(999);

    const state = buildSegmentState({
      project_id: 'project-1',
      segment_index: 1,
      start_image_url: 'start.png',
      end_image_url: 'end.png',
      originalParams: { legacy: true },
      seed: 123,
      random_seed: true,
      amount_of_motion: 0.9,
      advanced_mode: true,
      base_prompt: 'param prompt',
      negative_prompt: 'param negative',
      enhanced_prompt: 'param enhanced',
      num_frames: 200,
      loras: [{ path: 'user-lora.safetensors', strength: 0.4 }],
      travel_guidance: {
        kind: 'ltx_control',
        mode: 'video',
        strength: 0.6,
        videos: [
          {
            path: 'segment-video.mp4',
            start_frame: 2,
            end_frame: 7,
            treatment: 'clip',
            source_start_frame: 1,
            source_end_frame: null,
          },
        ],
      },
    });

    expect(mocks.resolveSeed32Bit).toHaveBeenCalledWith({
      seed: 123,
      randomize: true,
      fallbackSeed: 321,
      field: 'seed',
    });
    expect(mocks.buildBasicModePhaseConfig).not.toHaveBeenCalled();
    expect(state.inputImages).toEqual(['start.png', 'end.png']);
    expect(state.allInputImages).toEqual(['contract-start.png', 'contract-end.png']);
    expect(state.finalSeed).toBe(999);
    expect(state.additionalLoras).toEqual({ 'user-lora.safetensors': 0.4 });
    expect(state.motionMode).toBe('advanced');
    expect(state.amountOfMotion).toBe(0.9);
    expect(state.phaseConfig).toEqual(explicitPhaseConfig);
    expect(state.advancedMode).toBe(true);
    expect(state.loraMultipliers).toEqual([
      { url: 'phase-1.safetensors', multiplier: 0.5 },
      { url: 'phase-2.safetensors', multiplier: 0.75 },
    ]);
    expect(state.modelName).toBe('ltx2_22B_distilled');
    expect(state.numFrames).toBe(MAX_SEGMENT_FRAMES);
    expect(state.basePrompt).toBe('param prompt');
    expect(state.negativePrompt).toBe('param negative');
    expect(state.enhancedPrompt).toBe('param enhanced');
    expect(state.segmentFramesExpanded).toEqual([24, 24]);
    expect(state.frameOverlapExpanded).toEqual([6]);
    expect(state.structureVideos).toEqual([
      {
        path: 'segment-video.mp4',
        start_frame: 2,
        end_frame: 7,
        treatment: 'clip',
        source_start_frame: 1,
        source_end_frame: null,
      },
    ]);
  });

  it('prefers an explicit segment model_name override over the contract model', () => {
    mocks.buildTaskPayloadSnapshot.mockReturnValue({
      rawParams: {},
      orchestratorDetails: {},
    });
    mocks.readTravelContractData.mockReturnValue({
      modelName: 'wan_2_2_i2v_lightning_baseline_2_2_2',
    });
    mocks.resolveSeed32Bit.mockReturnValue(432);
    mocks.buildBasicModePhaseConfig.mockReturnValue(fallbackPhaseConfig);

    const state = buildSegmentState({
      project_id: 'project-1',
      segment_index: 0,
      start_image_url: 'start.png',
      originalParams: { legacy: true },
      model_name: 'ltx2_22B_distilled',
    });

    expect(state.modelName).toBe('ltx2_22B_distilled');
  });

  it('falls back to the generated basic phase config and raw snapshot loras when no explicit overrides exist', () => {
    mocks.buildTaskPayloadSnapshot.mockReturnValue({
      rawParams: {
        seed: 432,
        additional_loras: { raw: 0.3 },
        prompt: 'raw prompt',
        flow_shift: 8,
        sample_solver: 'raw-solver',
        guidance_scale: 1.5,
        guidance2_scale: 1.6,
        guidance_phases: 2,
        num_inference_steps: 8,
        model_switch_phase: 1,
        num_frames: 24,
      },
      orchestratorDetails: {
        seed_base: 654,
        additional_loras: { orch: 0.7 },
        flow_shift: 7,
        sample_solver: 'orch-solver',
        guidance_scale: 1.7,
        guidance2_scale: 1.8,
        guidance_phases: 3,
        num_inference_steps: 10,
        model_switch_phase: 2,
      },
    });
    mocks.readTravelContractData.mockReturnValue({
      motionMode: 'unsupported',
      amountOfMotion: 0.4,
      advancedMode: true,
    });
    mocks.resolveSeed32Bit.mockReturnValue(432);
    mocks.buildBasicModePhaseConfig.mockReturnValue(fallbackPhaseConfig);

    const state = buildSegmentState({
      project_id: 'project-1',
      segment_index: 0,
      start_image_url: 'start.png',
      originalParams: { legacy: true },
    });

    expect(mocks.buildBasicModePhaseConfig).toHaveBeenCalledWith(false, 0.4, []);
    expect(state.additionalLoras).toEqual({ raw: 0.3 });
    expect(state.motionMode).toBe('basic');
    expect(state.advancedMode).toBe(false);
    expect(state.phaseConfig).toEqual(fallbackPhaseConfig);
    expect(state.modelName).toBe('wan_2_2_i2v_lightning_baseline_2_2_2');
    expect(state.basePrompt).toBe('raw prompt');
    expect(state.negativePrompt).toBe('');
    expect(state.enhancedPrompt).toBeUndefined();
    expect(state.structureVideos).toBeUndefined();
  });
});
