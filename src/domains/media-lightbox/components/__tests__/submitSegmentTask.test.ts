import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask } from '@/shared/lib/taskCreation';
import type { RunTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import { buildStructureVideoForTask, submitSegmentTask } from '../submitSegmentTask';

vi.mock('@/shared/lib/taskCreation', () => ({
  createTask: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: vi.fn().mockReturnThis(),
    })),
    functions: {
      invoke: vi.fn(),
    },
  }),
}));

const getSettings = () => ({
  prompt: 'A prompt',
  negativePrompt: '',
  textBeforePrompts: '',
  textAfterPrompts: '',
  motionMode: 'basic' as const,
  amountOfMotion: 50,
  phaseConfig: undefined,
  selectedPhasePresetId: null,
  loras: [],
  numFrames: 25,
  randomSeed: true,
  seed: null,
  makePrimaryVariant: true,
  structureMotionStrength: undefined,
  structureTreatment: undefined,
  structureUni3cEndPercent: undefined,
});

describe('submitSegmentTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null structure video when required inputs are missing', () => {
    const result = buildStructureVideoForTask(
      {
        structureVideoUrl: undefined,
        structureVideoType: null,
        structureVideoFrameRange: undefined,
      },
      () => getSettings(),
    );

    expect(result).toBeNull();
  });

  it('builds canonical travel guidance alongside cleaned structure videos', () => {
    const result = buildStructureVideoForTask(
      {
        structureVideoUrl: 'https://example.com/guide.mp4',
        structureVideoType: 'uni3c',
        structureVideoFrameRange: {
          segmentStart: 8,
          segmentEnd: 24,
          videoTotalFrames: 48,
          videoFps: 24,
        },
        structureVideoDefaults: {
          motionStrength: 1.25,
          treatment: 'clip',
          uni3cEndPercent: 0.3,
        },
      },
      () => getSettings(),
    );

    expect(result).toEqual({
      structureVideos: [{
        path: 'https://example.com/guide.mp4',
        start_frame: 8,
        end_frame: 24,
        treatment: 'clip',
      }],
      travelGuidance: {
        kind: 'uni3c',
        videos: [{
          path: 'https://example.com/guide.mp4',
          start_frame: 8,
          end_frame: 24,
          treatment: 'clip',
        }],
        strength: 1.25,
        step_window: [0, 0.3],
        frame_policy: 'fit',
        zero_empty_frames: true,
      },
    });
  });

  it('fails closed before settings persistence or task creation', () => {
    const saveSettings = vi.fn().mockResolvedValue(false);
    const run = vi.fn<RunTaskPlaceholder>();
    const onNonFatalError = vi.fn();

    expect(() => submitSegmentTask({
      taskLabel: 'Segment 1',
      errorContext: 'submitSegmentTask.test',
      getSettings,
      saveSettings,
      shouldSaveSettings: true,
      shouldEnhance: false,
      defaultNumFrames: 25,
      images: {
        startImageUrl: 'https://example.com/start.png',
      },
      task: {
        projectId: 'project-1',
        segmentIndex: 0,
        structureInput: null,
      },
      run,
      queryClient: new QueryClient(),
      onNonFatalError,
    })).toThrow('Individual travel segment generation is blocked');

    expect(saveSettings).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(onNonFatalError).toHaveBeenCalledWith('unsupported_capability', expect.any(Error));
  });

  it('does not create an individual travel task even when settings are writable', () => {
    const createTaskMock = vi.mocked(createTask);
    createTaskMock.mockResolvedValue({ task_id: 'task-2', status: 'queued' });
    const saveSettings = vi.fn().mockResolvedValue(true);
    const run = vi.fn<RunTaskPlaceholder>();

    expect(() => submitSegmentTask({
      taskLabel: 'Segment 2',
      errorContext: 'submitSegmentTask.test',
      getSettings,
      saveSettings,
      shouldSaveSettings: true,
      shouldEnhance: false,
      defaultNumFrames: 25,
      images: {
        startImageUrl: 'https://example.com/start.png',
      },
      task: {
        projectId: 'project-1',
        segmentIndex: 1,
        modelName: 'ltx2_22B_distilled',
        structureInput: null,
      },
      run,
      queryClient: new QueryClient(),
    })).toThrow('Individual travel segment generation is blocked');

    expect(saveSettings).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
    expect(createTaskMock).not.toHaveBeenCalled();
  });
});
