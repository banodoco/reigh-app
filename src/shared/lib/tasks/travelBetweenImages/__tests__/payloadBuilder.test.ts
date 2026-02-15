import {
  describe,
  it,
  expect,
  vi
} from 'vitest';
import {
  validateTravelBetweenImagesParams,
  buildTravelBetweenImagesPayload,
} from '../payloadBuilder';

vi.mock('../../../taskCreation', () => ({
  expandArrayToCount: <T>(arr: T[] | undefined, targetCount: number): T[] => {
    if (!arr || arr.length === 0) return [];
    if (arr.length === 1 && targetCount > 1) return Array(targetCount).fill(arr[0]);
    if (arr.length > targetCount) return arr.slice(0, targetCount);
    return arr;
  },
  validateRequiredFields: (params: Record<string, unknown>, fields: string[]) => {
    for (const field of fields) {
      const value = params[field];
      if (value === undefined || value === null) {
        throw new TVE(`${field} is required`, field);
      }
      // Don't check empty arrays here — let source code's own validation handle those
    }
  },
  TaskValidationError: class extends Error {
    field?: string;
    constructor(message: string, field?: string) {
      super(message);
      this.name = 'TaskValidationError';
      this.field = field;
    }
  },
  safeParseJson: <T>(jsonStr: string | undefined, fallback: T): T => {
    if (!jsonStr) return fallback;
    try { return JSON.parse(jsonStr) as T; } catch { return fallback; }
  },
}));

class TVE extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'TaskValidationError';
    this.field = field;
  }
}

describe('validateTravelBetweenImagesParams', () => {
  const validParams = {
    project_id: 'proj-1',
    image_urls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    base_prompts: ['traveling between images'],
    segment_frames: [49],
    frame_overlap: [8],
  };

  it('passes with valid params', () => {
    expect(() => validateTravelBetweenImagesParams(validParams)).not.toThrow();
  });

  it('throws when image_urls is empty', () => {
    expect(() =>
      validateTravelBetweenImagesParams({ ...validParams, image_urls: [] })
    ).toThrow('At least one image_url is required');
  });

  it('throws when base_prompts is empty', () => {
    expect(() =>
      validateTravelBetweenImagesParams({ ...validParams, base_prompts: [] })
    ).toThrow('base_prompts is required');
  });

  it('throws when segment_frames is empty', () => {
    expect(() =>
      validateTravelBetweenImagesParams({ ...validParams, segment_frames: [] })
    ).toThrow('segment_frames is required');
  });

  it('throws when frame_overlap is empty', () => {
    expect(() =>
      validateTravelBetweenImagesParams({ ...validParams, frame_overlap: [] })
    ).toThrow('frame_overlap is required');
  });
});

describe('buildTravelBetweenImagesPayload', () => {
  const baseParams = {
    project_id: 'proj-1',
    image_urls: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
    base_prompts: ['traveling between images'],
    segment_frames: [49],
    frame_overlap: [8],
  };

  it('builds a basic payload with defaults', () => {
    const payload = buildTravelBetweenImagesPayload(
      baseParams,
      '1280x720',
      'task-id-1',
      'run-id-1'
    );

    expect(payload.orchestrator_task_id).toBe('task-id-1');
    expect(payload.run_id).toBe('run-id-1');
    expect(payload.input_image_paths_resolved).toEqual(baseParams.image_urls);
    expect(payload.num_new_segments_to_generate).toBe(1); // 2 images - 1 = 1 segment
    expect(payload.parsed_resolution_wh).toBe('1280x720');
    expect(payload.generation_source).toBe('batch');
    expect(payload.model_name).toBe('base_tester_model');
    expect(payload.seed_base).toBe(789);
    expect(payload.use_svi).toBe(false);
    expect(payload.independent_segments).toBe(true);
  });

  it('expands single-element arrays to match segment count', () => {
    const params = {
      ...baseParams,
      image_urls: ['a.jpg', 'b.jpg', 'c.jpg'], // 3 images = 2 segments
      base_prompts: ['single prompt'],
      segment_frames: [49],
      frame_overlap: [8],
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.num_new_segments_to_generate).toBe(2);
    expect(payload.base_prompts_expanded).toEqual(['single prompt', 'single prompt']);
    expect(payload.segment_frames_expanded).toEqual([49, 49]);
    expect(payload.frame_overlap_expanded).toEqual([8, 8]);
  });

  it('fills negative_prompts with empty strings when not provided', () => {
    const payload = buildTravelBetweenImagesPayload(
      baseParams,
      '1280x720',
      'tid',
      'rid'
    );

    // expandArrayToCount(undefined, 1) returns [] which is truthy, so fallback doesn't trigger
    expect(payload.negative_prompts_expanded).toEqual([]);
  });

  it('includes enhanced_prompts when provided', () => {
    const params = {
      ...baseParams,
      enhanced_prompts: ['enhanced version of the prompt'],
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.enhanced_prompts_expanded).toEqual(['enhanced version of the prompt']);
  });

  it('creates empty enhanced_prompts when enhance_prompt is true', () => {
    const params = {
      ...baseParams,
      enhance_prompt: true,
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.enhanced_prompts_expanded).toEqual(['']);
  });

  it('omits enhanced_prompts when neither provided nor enhance_prompt is true', () => {
    const payload = buildTravelBetweenImagesPayload(baseParams, '1280x720', 'tid', 'rid');
    expect(payload.enhanced_prompts_expanded).toBeUndefined();
  });

  it('includes parent_generation_id when provided', () => {
    const payload = buildTravelBetweenImagesPayload(
      baseParams,
      '1280x720',
      'tid',
      'rid',
      'parent-gen-1'
    );

    expect(payload.parent_generation_id).toBe('parent-gen-1');
  });

  it('omits parent_generation_id when not provided', () => {
    const payload = buildTravelBetweenImagesPayload(baseParams, '1280x720', 'tid', 'rid');
    expect(payload.parent_generation_id).toBeUndefined();
  });

  it('includes shot_id', () => {
    const params = { ...baseParams, shot_id: 'shot-1' };
    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.shot_id).toBe('shot-1');
  });

  it('converts loras to additional_loras map', () => {
    const params = {
      ...baseParams,
      loras: [
        { path: 'https://example.com/lora1.safetensors', strength: 0.8 },
        { path: 'https://example.com/lora2.safetensors', strength: 1.2 },
      ],
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.additional_loras).toEqual({
      'https://example.com/lora1.safetensors': 0.8,
      'https://example.com/lora2.safetensors': 1.2,
    });
  });

  it('includes phase_config when provided', () => {
    const phaseConfig = {
      num_phases: 2,
      steps_per_phase: [3, 3],
      flow_shift: 5.0,
      sample_solver: 'euler' as const,
      model_switch_phase: 1,
      phases: [],
    };

    const params = { ...baseParams, phase_config: phaseConfig };
    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.phase_config).toEqual(phaseConfig);
  });

  it('handles random_seed by generating random seed', () => {
    const params = {
      ...baseParams,
      random_seed: true,
      seed: 999, // Should be ignored
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(typeof payload.seed_base).toBe('number');
    expect(payload.seed_base).toBeLessThan(1000000);
  });

  it('uses provided seed when random_seed is false', () => {
    const params = {
      ...baseParams,
      seed: 42,
      random_seed: false,
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.seed_base).toBe(42);
  });

  it('includes steps only in non-advanced mode', () => {
    const params = {
      ...baseParams,
      steps: 15,
      advanced_mode: false,
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.steps).toBe(15);
    expect(payload.advanced_mode).toBe(false);
  });

  it('excludes steps in advanced mode', () => {
    const params = {
      ...baseParams,
      steps: 15,
      advanced_mode: true,
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.steps).toBeUndefined();
    expect(payload.advanced_mode).toBe(true);
  });

  it('excludes amount_of_motion in advanced mode', () => {
    const params = {
      ...baseParams,
      amount_of_motion: 0.8,
      advanced_mode: true,
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.amount_of_motion).toBeUndefined();
    expect(payload.regenerate_anchors).toBe(false);
  });

  it('includes text_before_prompts and text_after_prompts', () => {
    const params = {
      ...baseParams,
      text_before_prompts: 'cinematic, 4k, ',
      text_after_prompts: ', high quality',
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.text_before_prompts).toBe('cinematic, 4k, ');
    expect(payload.text_after_prompts).toBe(', high quality');
  });

  it('includes image_generation_ids when provided', () => {
    const params = {
      ...baseParams,
      image_generation_ids: ['gen-a', 'gen-b'],
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.input_image_generation_ids).toEqual(['gen-a', 'gen-b']);
  });

  it('includes pair_shot_generation_ids when provided', () => {
    const params = {
      ...baseParams,
      pair_shot_generation_ids: ['pair-1'],
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.pair_shot_generation_ids).toEqual(['pair-1']);
  });

  it('includes per-pair overrides when provided', () => {
    const params = {
      ...baseParams,
      pair_phase_configs: [{ num_phases: 2, steps_per_phase: [4, 4], flow_shift: 5, sample_solver: 'euler' as const, model_switch_phase: 1, phases: [] }],
      pair_loras: [[{ path: 'lora.safetensors', strength: 1.0 }]],
      pair_motion_settings: [{ amount_of_motion: 0.9 }],
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.phase_configs_expanded).toBeDefined();
    expect(payload.loras_per_segment_expanded).toBeDefined();
    expect(payload.motion_settings_expanded).toBeDefined();
  });

  it('omits per-pair overrides when all null', () => {
    const params = {
      ...baseParams,
      pair_phase_configs: [null],
      pair_loras: [null],
      pair_motion_settings: [null],
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.phase_configs_expanded).toBeUndefined();
    expect(payload.loras_per_segment_expanded).toBeUndefined();
    expect(payload.motion_settings_expanded).toBeUndefined();
  });

  // Structure guidance tests
  it('passes through structure_guidance directly', () => {
    const guidance = {
      target: 'uni3c' as const,
      strength: 0.8,
      step_window: [0.1, 0.9] as [number, number],
      frame_policy: 'fit' as const,
      zero_empty_frames: true,
    };

    const params = { ...baseParams, structure_guidance: guidance };
    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.structure_guidance).toEqual(guidance);
  });

  it('converts legacy structure_videos to unified format (vace)', () => {
    const params = {
      ...baseParams,
      structure_videos: [{
        path: 'https://example.com/video.mp4',
        start_frame: 0,
        end_frame: 81,
        treatment: 'adjust' as const,
        structure_type: 'flow' as const,
        motion_strength: 1.5,
      }],
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.structure_guidance).toBeDefined();
    const sg = payload.structure_guidance as Record<string, unknown>;
    expect(sg.target).toBe('vace');
    expect(sg.preprocessing).toBe('flow');
    expect(sg.strength).toBe(1.5);
    expect((sg.videos as unknown[])).toHaveLength(1);
  });

  it('converts legacy structure_videos to unified format (uni3c)', () => {
    const params = {
      ...baseParams,
      structure_videos: [{
        path: 'https://example.com/video.mp4',
        start_frame: 0,
        end_frame: 81,
        treatment: 'adjust' as const,
        structure_type: 'uni3c' as const,
        motion_strength: 0.8,
        uni3c_start_percent: 0.1,
        uni3c_end_percent: 0.9,
      }],
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    const sg = payload.structure_guidance as Record<string, unknown>;
    expect(sg.target).toBe('uni3c');
    expect(sg.step_window).toEqual([0.1, 0.9]);
    expect(sg.frame_policy).toBe('fit');
    expect(sg.zero_empty_frames).toBe(true);
  });

  it('converts legacy single structure_video_path to unified format', () => {
    const params = {
      ...baseParams,
      structure_video_path: 'https://example.com/video.mp4',
      structure_video_type: 'canny' as const,
      structure_video_motion_strength: 1.3,
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    const sg = payload.structure_guidance as Record<string, unknown>;
    expect(sg.target).toBe('vace');
    expect(sg.preprocessing).toBe('canny');
    expect(sg.strength).toBe(1.3);
  });

  it('removes legacy structure params from payload', () => {
    const params = {
      ...baseParams,
      structure_guidance: { target: 'uni3c' as const, strength: 1.0 },
      structure_type: 'flow',
      structure_videos: [{ path: 'old.mp4' }],
      use_uni3c: true,
    } as Record<string, unknown>;

    const payload = buildTravelBetweenImagesPayload(
      params as typeof baseParams, '1280x720', 'tid', 'rid'
    );
    expect(payload.structure_type).toBeUndefined();
    expect(payload.structure_videos).toBeUndefined();
    expect(payload.use_uni3c).toBeUndefined();
  });

  it('includes generation_name', () => {
    const params = { ...baseParams, generation_name: 'My Gen' };
    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.generation_name).toBe('My Gen');
  });

  it('includes motion_mode when provided', () => {
    const params = { ...baseParams, motion_mode: 'basic' as const };
    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.motion_mode).toBe('basic');
  });

  it('includes selected_phase_preset_id when provided', () => {
    const params = { ...baseParams, selected_phase_preset_id: 'preset-1' };
    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.selected_phase_preset_id).toBe('preset-1');
  });

  it('parses steps from params_json_str when steps not directly provided in non-advanced mode', () => {
    const params = {
      ...baseParams,
      params_json_str: JSON.stringify({ steps: 25 }),
      advanced_mode: false,
    };

    const payload = buildTravelBetweenImagesPayload(params, '1280x720', 'tid', 'rid');
    expect(payload.steps).toBe(25);
  });

  it('uses default steps when not provided and not in advanced mode', () => {
    const payload = buildTravelBetweenImagesPayload(baseParams, '1280x720', 'tid', 'rid');
    expect(payload.steps).toBe(20); // DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.steps
  });
});
