import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/families/individualTravelSegment';
import { buildStructureVideoForTask, submitSegmentTask } from '../submitSegmentTask';

vi.mock('@/shared/lib/tasks/families/individualTravelSegment', () => ({
  createIndividualTravelSegmentTask: vi.fn(),
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

const flushPromises = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 0));
};

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

  it('aborts task creation when settings persistence fails', async () => {
    const createTaskMock = vi.mocked(createIndividualTravelSegmentTask);
    createTaskMock.mockResolvedValue({ task_id: 'task-1' } as Awaited<ReturnType<typeof createIndividualTravelSegmentTask>>);
    const saveSettings = vi.fn().mockResolvedValue(false);

    let createError: unknown;
    const run: RunTaskPlaceholder = async ({ create }) => {
      try {
        await create();
      } catch (error) {
        createError = error;
      }
    };

    submitSegmentTask({
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
    });

    await flushPromises();

    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(createTaskMock).not.toHaveBeenCalled();
    expect(createError).toBeInstanceOf(Error);
    expect((createError as Error).message).toContain('Failed to save segment settings');
  });

  it('creates a task when settings persistence succeeds', async () => {
    const createTaskMock = vi.mocked(createIndividualTravelSegmentTask);
    createTaskMock.mockResolvedValue({ task_id: 'task-2' } as Awaited<ReturnType<typeof createIndividualTravelSegmentTask>>);
    const saveSettings = vi.fn().mockResolvedValue(true);

    let createdTaskId: string | undefined;
    const run: RunTaskPlaceholder = async ({ create }) => {
      createdTaskId = await create() as string;
    };

    submitSegmentTask({
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
    });

    await flushPromises();

    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(createTaskMock).toHaveBeenCalledTimes(1);
    expect(createTaskMock).toHaveBeenCalledWith(expect.objectContaining({
      model_name: 'ltx2_22B_distilled',
    }));
    expect(createdTaskId).toBe('task-2');
  });
});
