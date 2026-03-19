import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createIndividualTravelSegmentTask } from './index';

const mockCreateTask = vi.fn();
const mockResolveProjectResolution = vi.fn();

vi.mock('../../../taskCreation', () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  resolveProjectResolution: (...args: unknown[]) => mockResolveProjectResolution(...args),
  resolveSeed32Bit: ({
    seed,
    randomize,
    fallbackSeed,
  }: {
    seed?: number;
    randomize?: boolean;
    fallbackSeed?: number;
  }) => (randomize ? 424242 : (seed ?? fallbackSeed ?? 424242)),
  TaskValidationError: class extends Error {
    field?: string;
    constructor(message: string, field?: string) {
      super(message);
      this.name = 'TaskValidationError';
      this.field = field;
    }
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/vaceDefaults', () => ({
  VACE_GENERATION_DEFAULTS: {
    model: 'default-vace-model',
  },
}));

vi.mock('@/shared/lib/tooling/toolIds', () => ({
  TOOL_IDS: {
    TRAVEL_BETWEEN_IMAGES: 'travel-between-images',
  },
}));

// Mock supabase
const mockSupabaseFrom = vi.fn();
const mockSupabaseRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: (...args: unknown[]) => mockSupabaseFrom(...args),
    rpc: (...args: unknown[]) => mockSupabaseRpc(...args),
  }),
}));

vi.mock('@/shared/types/phaseConfig', () => ({
  buildBasicModePhaseConfig: () => ({
    num_phases: 2,
    steps_per_phase: [3, 3],
    flow_shift: 5.0,
    sample_solver: 'euler',
    model_switch_phase: 1,
    phases: [
      { phase: 1, guidance_scale: 1.0, loras: [] },
      { phase: 2, guidance_scale: 1.0, loras: [] },
    ],
  }),
}));

describe('createIndividualTravelSegmentTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });
    mockResolveProjectResolution.mockResolvedValue({ resolution: '1280x720', aspectRatio: '16:9' });

    // Default supabase mock: no existing children found
    mockSupabaseFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    });

    mockSupabaseRpc.mockResolvedValue({ data: 'parent-from-shot', error: null });
  });

  it('creates a task with existing parent_generation_id', async () => {
    const result = await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
    });

    expect(result).toEqual({ task_id: 'task-1', status: 'pending' });
    expect(mockCreateTask).toHaveBeenCalledOnce();

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.project_id).toBe('proj-1');
    expect(call.task_type).toBe('individual_travel_segment');
    expect(call.params.parent_generation_id).toBe('parent-1');
    expect(call.params.segment_index).toBe(0);
    expect(mockSupabaseRpc).not.toHaveBeenCalled();
  });

  it('includes both input images in params', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.input_image_paths_resolved).toEqual([
      'https://example.com/start.jpg',
      'https://example.com/end.jpg',
    ]);
  });

  it('handles trailing segments (no end_image_url)', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 2,
      start_image_url: 'https://example.com/start.jpg',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.input_image_paths_resolved).toEqual([
      'https://example.com/start.jpg',
    ]);
    // individual_segment_params should also reflect single image
    expect(params.individual_segment_params.input_image_paths_resolved).toEqual([
      'https://example.com/start.jpg',
    ]);
    expect(params.individual_segment_params.end_image_url).toBeUndefined();
  });

  it('applies UI overrides from params', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      base_prompt: 'custom prompt',
      negative_prompt: 'no blur',
      num_frames: 49,
      seed: 12345,
      amount_of_motion: 0.8,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.base_prompt).toBe('custom prompt');
    expect(params.negative_prompt).toBe('no blur');
    expect(params.num_frames).toBe(49);
    expect(params.seed_to_use).toBe(12345);
    expect(params.amount_of_motion).toBe(0.8);
  });

  it('generates random seed when random_seed is true', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      random_seed: true,
      seed: 99999, // Should be ignored
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    // Seed should be random, not 99999
    expect(typeof params.seed_to_use).toBe('number');
    expect(params.seed_to_use).toBeLessThan(0x7fffffff);
  });

  it('rejects num_frames exceeding model max (81 for WAN default)', async () => {
    await expect(
      createIndividualTravelSegmentTask({
        project_id: 'proj-1',
        parent_generation_id: 'parent-1',
        segment_index: 0,
        start_image_url: 'https://example.com/start.jpg',
        end_image_url: 'https://example.com/end.jpg',
        num_frames: 100,
      })
    ).rejects.toThrow('num_frames (100) exceeds maximum of 81');
  });

  it('allows higher num_frames for LTX models (max 241)', async () => {
    // LTX models support up to 241 frames — should not throw
    await expect(
      createIndividualTravelSegmentTask({
        project_id: 'proj-1',
        parent_generation_id: 'parent-1',
        segment_index: 0,
        start_image_url: 'https://example.com/start.jpg',
        end_image_url: 'https://example.com/end.jpg',
        num_frames: 105,
        model_name: 'ltx2_22B_distilled',
      })
    ).resolves.toBeDefined();
  });

  it('includes enhanced_prompt when provided', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      base_prompt: 'a bird',
      enhanced_prompt: 'a majestic bird soaring through clouds',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.enhanced_prompt).toBe('a majestic bird soaring through clouds');
    expect(params.individual_segment_params.enhanced_prompt).toBe('a majestic bird soaring through clouds');
  });

  it('includes generation_name when provided', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      generation_name: 'My Variant',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.generation_name).toBe('My Variant');
  });

  it('defaults make_primary_variant to true', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.make_primary_variant).toBe(true);
  });

  it('can set make_primary_variant to false', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      make_primary_variant: false,
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.make_primary_variant).toBe(false);
  });

  it('includes image tethering IDs', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      start_image_generation_id: 'gen-start',
      end_image_generation_id: 'gen-end',
      pair_shot_generation_id: 'pair-sg-1',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.start_image_generation_id).toBe('gen-start');
    expect(params.end_image_generation_id).toBe('gen-end');
    expect(params.pair_shot_generation_id).toBe('pair-sg-1');
  });

  it('does not set based_on (routing uses generationRouting contract instead)', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      child_generation_id: 'child-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.based_on).toBeUndefined();
    expect(params.child_generation_id).toBe('child-1');
  });

  it('strips legacy svi fields from orchestrator_details', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      originalParams: {
        orchestrator_details: {
          use_svi: true,
          svi_predecessor_video_url: 'https://example.com/prev.mp4',
          svi_strength_1: 0.25,
          svi_strength_2: 0.5,
        },
      },
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.orchestrator_details.use_svi).toBeUndefined();
    expect(params.orchestrator_details.svi_predecessor_video_url).toBeUndefined();
    expect(params.orchestrator_details.svi_strength_1).toBeUndefined();
    expect(params.orchestrator_details.svi_strength_2).toBeUndefined();
  });

  it('removes orchestrator references from orchestrator_details', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      originalParams: {
        orchestrator_details: {
          orchestrator_task_id: 'old-orch-id',
          orchestrator_task_id_ref: 'old-ref',
          run_id: 'old-run',
          orchestrator_run_id: 'old-orch-run',
          some_other_field: 'keep this',
        },
      },
    });

    const orchDetails = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orchDetails.orchestrator_task_id).toBeUndefined();
    expect(orchDetails.orchestrator_task_id_ref).toBeUndefined();
    expect(orchDetails.run_id).toBeUndefined();
    expect(orchDetails.orchestrator_run_id).toBeUndefined();
    expect(orchDetails.some_other_field).toBe('keep this');
  });

  it('sets generation_source to individual_segment', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
    });

    const orchDetails = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orchDetails.generation_source).toBe('individual_segment');
  });

  it('includes individual_segment_params with all UI overrides', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      base_prompt: 'my prompt',
      num_frames: 49,
      seed: 100,
      amount_of_motion: 0.7,
      motion_mode: 'basic',
      loras: [{ path: 'https://example.com/lora.safetensors', strength: 1.0 }],
    });

    const isp = mockCreateTask.mock.calls[0][0].params.individual_segment_params;
    expect(isp.base_prompt).toBe('my prompt');
    expect(isp.num_frames).toBe(49);
    expect(isp.seed_to_use).toBe(100);
    expect(isp.amount_of_motion).toBe(0.7);
    expect(isp.motion_mode).toBe('basic');
    expect(isp.additional_loras).toEqual({
      'https://example.com/lora.safetensors': 1.0,
    });
    expect(isp.phase_config).toBeDefined();
  });

  it('uses explicitly provided loras even when empty', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      loras: [], // Empty means user cleared all loras
      originalParams: {
        additional_loras: { 'original-lora': 1.0 },
      },
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    // Should be empty, not the original
    expect(params.additional_loras).toEqual({});
  });

  it('falls back to original loras when params.loras is undefined', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      originalParams: {
        additional_loras: { 'original-lora': 0.9 },
      },
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.additional_loras).toEqual({ 'original-lora': 0.9 });
  });

  // Validation tests
  it('throws when project_id is missing', async () => {
    await expect(
      createIndividualTravelSegmentTask({
        project_id: '',
        parent_generation_id: 'parent-1',
        segment_index: 0,
        start_image_url: 'https://example.com/start.jpg',
      })
    ).rejects.toThrow('project_id is required');
  });

  it('throws when neither parent_generation_id nor shot_id provided', async () => {
    await expect(
      createIndividualTravelSegmentTask({
        project_id: 'proj-1',
        segment_index: 0,
        start_image_url: 'https://example.com/start.jpg',
      })
    ).rejects.toThrow('Either parent_generation_id or shot_id is required');
  });

  it('throws when segment_index is negative', async () => {
    await expect(
      createIndividualTravelSegmentTask({
        project_id: 'proj-1',
        parent_generation_id: 'parent-1',
        segment_index: -1,
        start_image_url: 'https://example.com/start.jpg',
      })
    ).rejects.toThrow('segment_index must be a non-negative number');
  });

  it('throws when start_image_url is missing', async () => {
    await expect(
      createIndividualTravelSegmentTask({
        project_id: 'proj-1',
        parent_generation_id: 'parent-1',
        segment_index: 0,
        start_image_url: '',
      })
    ).rejects.toThrow('start_image_url is required');
  });

  it('ensures parent when shot_id provided without parent_generation_id', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      shot_id: 'shot-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
    });

    expect(mockSupabaseRpc).toHaveBeenCalledWith('ensure_shot_parent_generation', {
      p_shot_id: 'shot-1',
      p_project_id: 'proj-1',
    });
  });

  it('throws when ensure parent RPC fails', async () => {
    mockSupabaseRpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'RPC failed' },
    });

    await expect(
      createIndividualTravelSegmentTask({
        project_id: 'proj-1',
        shot_id: 'shot-1',
        segment_index: 0,
        start_image_url: 'https://example.com/start.jpg',
        end_image_url: 'https://example.com/end.jpg',
      })
    ).rejects.toThrow('Failed to ensure parent generation for shot shot-1: RPC failed');
  });

  it('removes legacy structure params from orchestrator_details', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      originalParams: {
        orchestrator_details: {
          structure_type: 'legacy',
          structure_videos: ['old'],
          use_uni3c: true,
          uni3c_guide_video: 'guide.mp4',
        },
      },
    });

    const orchDetails = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orchDetails.structure_type).toBeUndefined();
    expect(orchDetails.structure_videos).toBeUndefined();
    expect(orchDetails.use_uni3c).toBeUndefined();
    expect(orchDetails.uni3c_guide_video).toBeUndefined();
  });

  it('writes canonical travel_guidance on task params while stripping nested legacy duplicates', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      structure_videos: [{
        path: 'https://example.com/guide.mp4',
        start_frame: 0,
        end_frame: 49,
        treatment: 'adjust',
      }],
      structure_guidance: {
        target: 'vace',
        preprocessing: 'flow',
        strength: 1,
        videos: [{
          path: 'https://example.com/guide.mp4',
          start_frame: 0,
          end_frame: 49,
          treatment: 'adjust',
        }],
      },
    });

    const params = mockCreateTask.mock.calls[0][0].params;
    expect(params.travel_guidance).toEqual({
      kind: 'vace',
      mode: 'flow',
      videos: [{
        path: 'https://example.com/guide.mp4',
        start_frame: 0,
        end_frame: 49,
        treatment: 'adjust',
      }],
      strength: 1,
    });
    expect(params.structure_videos).toBeUndefined();
    expect(params.structure_guidance).toBeUndefined();
    expect(params.orchestrator_details.structure_videos).toBeUndefined();
    expect(params.orchestrator_details.structure_guidance).toBeUndefined();
  });

  it('includes variant IDs in individual_segment_params', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      start_image_variant_id: 'v-start',
      end_image_variant_id: 'v-end',
    });

    const isp = mockCreateTask.mock.calls[0][0].params.individual_segment_params;
    expect(isp.start_image_variant_id).toBe('v-start');
    expect(isp.end_image_variant_id).toBe('v-end');
  });

  it('uses originalParams resolution when available', async () => {
    await createIndividualTravelSegmentTask({
      project_id: 'proj-1',
      parent_generation_id: 'parent-1',
      segment_index: 0,
      start_image_url: 'https://example.com/start.jpg',
      end_image_url: 'https://example.com/end.jpg',
      originalParams: {
        parsed_resolution_wh: '1920x1080',
      },
    });

    expect(mockResolveProjectResolution).toHaveBeenCalledWith('proj-1', '1920x1080');
  });

  it('rethrows createTask errors', async () => {
    mockCreateTask.mockRejectedValue(new Error('API down'));

    await expect(
      createIndividualTravelSegmentTask({
        project_id: 'proj-1',
        parent_generation_id: 'parent-1',
        segment_index: 0,
        start_image_url: 'https://example.com/start.jpg',
        end_image_url: 'https://example.com/end.jpg',
      })
    ).rejects.toThrow('API down');
  });
});
