import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createCanonicalJoinClipsTask,
} from '../joinClips';
import { createJoinClipsTaskCompat } from './helpers/joinClipsCompatAdapter';

const mockCreateTask = vi.fn();
const mockGenerateTaskId = vi.fn();
const mockGenerateRunId = vi.fn();

vi.mock('../../taskCreation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../taskCreation')>();
  return {
    ...actual,
    createTask: (...args: unknown[]) => mockCreateTask(...args),
    generateTaskId: (...args: unknown[]) => mockGenerateTaskId(...args),
    generateRunId: (...args: unknown[]) => mockGenerateRunId(...args),
    validateRequiredFields: (params: Record<string, unknown>, fields: string[]) => {
      for (const field of fields) {
        const value = params[field];
        if (value === undefined || value === null) {
          throw new TVE(`${field} is required`, field);
        }
        if (typeof value === 'string' && value.trim() === '') {
          throw new TVE(`${field} cannot be empty`, field);
        }
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
  };
});

class TVE extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'TaskValidationError';
    this.field = field;
  }
}

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/joinClipsDefaults', () => ({
  joinClipsSettings: {
    id: 'join-clips',
    scope: ['project', 'shot'],
    defaults: {
      prompt: 'default prompt',
      contextFrameCount: 15,
      gapFrameCount: 23,
      replaceMode: true,
      enhancePrompt: false,
      model: 'default-model',
      numInferenceSteps: 6,
      guidanceScale: 5.0,
      seed: 789,
      negativePrompt: '',
      priority: 0,
      motionMode: 'basic',
      selectedPhasePresetId: null,
    },
  },
}));

vi.mock('@/shared/lib/utils/caseConversion', () => ({
  camelToSnakeKeys: (obj: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const snakeKey = key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`);
      result[snakeKey] = value;
    }
    return result;
  },
}));

describe('createJoinClipsTaskCompat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'task-1', status: 'pending' });
    mockGenerateTaskId.mockReturnValue('join_clips_orchestrator_240101_abc123');
    mockGenerateRunId.mockReturnValue('20250101T000000000');
  });

  it('creates a task with clips array', async () => {
    const result = await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
    });

    expect(result).toEqual({ task_id: 'task-1', status: 'pending' });
    expect(mockCreateTask).toHaveBeenCalledOnce();

    const call = mockCreateTask.mock.calls[0][0];
    expect(call.project_id).toBe('proj-1');
    expect(call.task_type).toBe('join_clips_orchestrator');

    const orch = call.params.orchestrator_details;
    expect(orch.clip_list).toHaveLength(2);
    expect(orch.clip_list[0].url).toBe('https://example.com/clip1.mp4');
    expect(orch.clip_list[1].url).toBe('https://example.com/clip2.mp4');
    expect(orch.orchestrator_task_id).toBe('join_clips_orchestrator_240101_abc123');
    expect(orch.run_id).toBe('20250101T000000000');
  });

  it('creates a multi-clip task through the canonical entrypoint', async () => {
    await createCanonicalJoinClipsTask({
      project_id: 'proj-1',
      mode: 'multi_clip',
      clip_source: {
        kind: 'clips',
        clips: [
          { url: 'https://example.com/clip1.mp4' },
          { url: 'https://example.com/clip2.mp4' },
        ],
      },
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.clip_list).toHaveLength(2);
  });

  it('creates a video-edit task through the canonical entrypoint', async () => {
    await createCanonicalJoinClipsTask({
      project_id: 'proj-1',
      mode: 'video_edit',
      clip_source: {
        kind: 'clips',
        clips: [
          { url: 'https://example.com/clip1.mp4' },
          { url: 'https://example.com/clip2.mp4' },
        ],
      },
      video_edit: {
        source_video_url: 'https://example.com/source.mp4',
      },
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.video_edit_mode).toBe(true);
    expect(orch.source_video_url).toBe('https://example.com/source.mp4');
  });

  it('creates a task from canonical clip_source descriptor', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      mode: 'multi_clip',
      clip_source: {
        kind: 'clips',
        clips: [
          { url: 'https://example.com/clip-a.mp4', name: 'A' },
          { url: 'https://example.com/clip-b.mp4', name: 'B' },
        ],
      },
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.clip_list).toHaveLength(2);
    expect(orch.clip_list[0]).toEqual({ url: 'https://example.com/clip-a.mp4', name: 'A' });
    expect(orch.clip_list[1]).toEqual({ url: 'https://example.com/clip-b.mp4', name: 'B' });
  });

  it('uses legacy starting/ending video paths', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      starting_video_path: 'https://example.com/start.mp4',
      ending_video_path: 'https://example.com/end.mp4',
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.clip_list).toHaveLength(2);
    expect(orch.clip_list[0].url).toBe('https://example.com/start.mp4');
    expect(orch.clip_list[1].url).toBe('https://example.com/end.mp4');
  });

  it('includes intermediate video paths in legacy mode', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      starting_video_path: 'https://example.com/start.mp4',
      intermediate_video_paths: [
        'https://example.com/mid1.mp4',
        'https://example.com/mid2.mp4',
      ],
      ending_video_path: 'https://example.com/end.mp4',
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.clip_list).toHaveLength(4);
  });

  it('prefers clips array over legacy format', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/a.mp4' },
        { url: 'https://example.com/b.mp4' },
      ],
      starting_video_path: 'https://example.com/start.mp4',
      ending_video_path: 'https://example.com/end.mp4',
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.clip_list[0].url).toBe('https://example.com/a.mp4');
    expect(orch.clip_list[1].url).toBe('https://example.com/b.mp4');
  });

  it('throws when fewer than 2 clips', async () => {
    await expect(
      createJoinClipsTaskCompat({
        project_id: 'proj-1',
        clips: [{ url: 'https://example.com/only-one.mp4' }],
      })
    ).rejects.toThrow('At least two clips are required');
  });

  it('throws when a clip URL is empty', async () => {
    await expect(
      createJoinClipsTaskCompat({
        project_id: 'proj-1',
        clips: [
          { url: 'https://example.com/clip1.mp4' },
          { url: '' },
        ],
      })
    ).rejects.toThrow('Clip at position 1 is missing a URL');
  });

  it('uses provided run_id instead of generating one', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      run_id: 'custom-run-id',
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.run_id).toBe('custom-run-id');
  });

  it('passes through optional global settings', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      prompt: 'smooth transition',
      context_frame_count: 10,
      gap_frame_count: 20,
      replace_mode: false,
      model: 'custom-model',
      seed: 42,
      shot_id: 'shot-1',
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.prompt).toBe('smooth transition');
    expect(orch.context_frame_count).toBe(10);
    expect(orch.gap_frame_count).toBe(20);
    expect(orch.replace_mode).toBe(false);
    expect(orch.model).toBe('custom-model');
    expect(orch.seed).toBe(42);
    expect(orch.shot_id).toBe('shot-1');
  });

  it('includes per_join_settings when provided', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
        { url: 'https://example.com/clip3.mp4' },
      ],
      per_join_settings: [
        { prompt: 'first transition', gap_frame_count: 15 },
        { prompt: 'second transition' },
      ],
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.per_join_settings).toHaveLength(2);
    expect(orch.per_join_settings[0].prompt).toBe('first transition');
    expect(orch.per_join_settings[0].gap_frame_count).toBe(15);
    expect(orch.per_join_settings[1].prompt).toBe('second transition');
  });

  it('throws when per_join_settings exceeds number of joins', async () => {
    await expect(
      createJoinClipsTaskCompat({
        project_id: 'proj-1',
        clips: [
          { url: 'https://example.com/clip1.mp4' },
          { url: 'https://example.com/clip2.mp4' },
        ],
        per_join_settings: [
          { prompt: 'first' },
          { prompt: 'second - too many' },
        ],
      })
    ).rejects.toThrow('per_join_settings length cannot exceed');
  });

  it('includes parent_generation_id in both payload and top level', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      parent_generation_id: 'parent-gen-1',
    });

    const callParams = mockCreateTask.mock.calls[0][0].params;
    expect(callParams.parent_generation_id).toBe('parent-gen-1');
    expect(callParams.orchestrator_details.parent_generation_id).toBe('parent-gen-1');
  });

  it('includes tool_type only when explicitly provided', async () => {
    // Without tool_type
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
    });

    expect(mockCreateTask.mock.calls[0][0].params.tool_type).toBeUndefined();

    // With tool_type
    vi.clearAllMocks();
    mockCreateTask.mockResolvedValue({ task_id: 'task-2', status: 'pending' });

    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      tool_type: 'join-clips',
    });

    expect(mockCreateTask.mock.calls[0][0].params.tool_type).toBe('join-clips');
  });

  it('includes video_edit_mode params when enabled', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      video_edit_mode: true,
      source_video_url: 'https://example.com/source.mp4',
      source_video_fps: 24,
      source_video_duration: 10.5,
      source_video_total_frames: 252,
      portions_to_regenerate: [
        { start_frame: 0, end_frame: 50, start_time_seconds: 0, end_time_seconds: 2.08, frame_count: 50 },
      ],
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.video_edit_mode).toBe(true);
    expect(orch.source_video_url).toBe('https://example.com/source.mp4');
    expect(orch.source_video_fps).toBe(24);
    expect(orch.source_video_duration).toBe(10.5);
    expect(orch.portions_to_regenerate).toHaveLength(1);
  });

  it('supports canonical video_edit config block', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      mode: 'video_edit',
      clip_source: {
        kind: 'clips',
        clips: [
          { url: 'https://example.com/clip1.mp4' },
          { url: 'https://example.com/clip2.mp4' },
        ],
      },
      video_edit: {
        source_video_url: 'https://example.com/source.mp4',
        source_video_fps: 30,
        source_video_duration: 8.5,
        source_video_total_frames: 255,
        portions_to_regenerate: [
          { start_frame: 0, end_frame: 50, start_time_seconds: 0, end_time_seconds: 1.7, frame_count: 50 },
        ],
      },
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.video_edit_mode).toBe(true);
    expect(orch.source_video_url).toBe('https://example.com/source.mp4');
    expect(orch.source_video_fps).toBe(30);
    expect(orch.source_video_total_frames).toBe(255);
    expect(orch.portions_to_regenerate).toHaveLength(1);
  });

  it('includes audio_url when provided', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      audio_url: 'https://example.com/audio.mp3',
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.audio_url).toBe('https://example.com/audio.mp3');
  });

  it('includes additional_loras from loras array', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      loras: [
        { path: 'https://example.com/lora.safetensors', strength: 0.8 },
      ],
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.additional_loras).toEqual({
      'https://example.com/lora.safetensors': 0.8,
    });
  });

  it('includes based_on for variant creation', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      based_on: 'gen-source',
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.based_on).toBe('gen-source');
  });

  it('includes loop_first_clip when set', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      loop_first_clip: true,
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.loop_first_clip).toBe(true);
  });

  it('always sets advanced_mode to true', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.advanced_mode).toBe(true);
  });

  it('builds phase_config with default lora', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.phase_config).toBeDefined();
    expect(orch.phase_config.num_phases).toBe(3);
    expect(orch.phase_config.phases).toHaveLength(3);
    // Each phase should have the default motion_scale lora
    orch.phase_config.phases.forEach((phase: Record<string, unknown>) => {
      const loras = phase.loras as Array<Record<string, unknown>>;
      const hasMotionScale = loras.some(l =>
        (l.url as string).includes('motion_scale')
      );
      expect(hasMotionScale).toBe(true);
    });
  });

  it('uses explicit phase_config when provided', async () => {
    const customConfig = {
      num_phases: 2,
      steps_per_phase: [4, 4],
      flow_shift: 3.0,
      sample_solver: 'euler',
      model_switch_phase: 1,
      phases: [
        { phase: 1, guidance_scale: 2.0, loras: [] },
        { phase: 2, guidance_scale: 1.0, loras: [] },
      ],
    };

    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      phase_config: customConfig,
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.phase_config).toEqual(customConfig);
  });

  it('includes clip names when provided', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4', name: 'Intro' },
        { url: 'https://example.com/clip2.mp4', name: 'Outro' },
      ],
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.clip_list[0].name).toBe('Intro');
    expect(orch.clip_list[1].name).toBe('Outro');
  });

  it('maps per-join loras to additional_loras format', async () => {
    await createJoinClipsTaskCompat({
      project_id: 'proj-1',
      clips: [
        { url: 'https://example.com/clip1.mp4' },
        { url: 'https://example.com/clip2.mp4' },
      ],
      per_join_settings: [
        {
          loras: [{ path: 'https://example.com/join-lora.safetensors', strength: 0.5 }],
        },
      ],
    });

    const orch = mockCreateTask.mock.calls[0][0].params.orchestrator_details;
    expect(orch.per_join_settings[0].additional_loras).toEqual({
      'https://example.com/join-lora.safetensors': 0.5,
    });
  });

  it('rejects explicit legacy mode', async () => {
    await expect(
      createJoinClipsTaskCompat({
        project_id: 'proj-1',
        mode: 'legacy',
        clip_source: {
          kind: 'clips',
          clips: [
            { url: 'https://example.com/clip1.mp4' },
            { url: 'https://example.com/clip2.mp4' },
          ],
        },
      }),
    ).rejects.toThrow("mode='legacy' is no longer supported");
  });

  it('rejects mixed clip source compatibility fields', async () => {
    await expect(
      createJoinClipsTaskCompat({
        project_id: 'proj-1',
        clip_source: {
          kind: 'clips',
          clips: [
            { url: 'https://example.com/clip1.mp4' },
            { url: 'https://example.com/clip2.mp4' },
          ],
        },
        clips: [
          { url: 'https://example.com/clip3.mp4' },
          { url: 'https://example.com/clip4.mp4' },
        ],
      }),
    ).rejects.toThrow('Provide exactly one clip-source mode');
  });

  it('rejects mixed video edit compatibility fields', async () => {
    await expect(
      createJoinClipsTaskCompat({
        project_id: 'proj-1',
        mode: 'video_edit',
        clips: [
          { url: 'https://example.com/clip1.mp4' },
          { url: 'https://example.com/clip2.mp4' },
        ],
        video_edit: {
          source_video_url: 'https://example.com/source.mp4',
        },
        video_edit_mode: true,
        source_video_url: 'https://example.com/source.mp4',
      }),
    ).rejects.toThrow('Provide exactly one video-edit mode');
  });

  it('rejects partial legacy video-edit payloads without video_edit_mode', async () => {
    await expect(
      createJoinClipsTaskCompat({
        project_id: 'proj-1',
        clips: [
          { url: 'https://example.com/clip1.mp4' },
          { url: 'https://example.com/clip2.mp4' },
        ],
        source_video_url: 'https://example.com/source.mp4',
      }),
    ).rejects.toThrow('Legacy source_* video edit fields require video_edit_mode=true');
  });
});
