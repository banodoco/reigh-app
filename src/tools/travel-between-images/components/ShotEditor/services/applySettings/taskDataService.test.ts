import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: (...args: unknown[]) => mocks.maybeSingle(...args),
        }),
      }),
    }),
  }),
}));

vi.mock('@/shared/lib/tasks/travelBetweenImages/legacyStructureVideo', async () => {
  const actual = await vi.importActual<typeof import('@/shared/lib/tasks/travelBetweenImages/legacyStructureVideo')>(
    '@/shared/lib/tasks/travelBetweenImages/legacyStructureVideo',
  );
  return {
    ...actual,
    collectTravelStructureLegacyUsage: vi.fn(() => ({
      topLevelFields: [],
      structureVideoFields: [],
    })),
    enforceTravelStructureLegacyPolicy: vi.fn(() => false),
  };
});

import { extractSettings, fetchTask } from './taskDataService';

describe('fetchTask', () => {
  it('returns a missing result when no task row exists', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });

    await expect(fetchTask('task-1')).resolves.toEqual({ status: 'missing' });
  });

  it('returns found task data when the row exists', async () => {
    mocks.maybeSingle.mockResolvedValueOnce({
      data: {
        params: {
          prompt: 'hello',
          orchestrator_details: {
            base_prompt: 'from-orchestrator',
          },
        },
      },
      error: null,
    });

    await expect(fetchTask('task-2')).resolves.toEqual({
      status: 'found',
      taskData: {
        params: {
          prompt: 'hello',
          orchestrator_details: {
            base_prompt: 'from-orchestrator',
          },
        },
        orchestrator: {
          base_prompt: 'from-orchestrator',
        },
      },
    });
  });

  it('throws operational query errors instead of collapsing them into missing', async () => {
    const error = new Error('database unavailable');
    mocks.maybeSingle.mockResolvedValueOnce({ data: null, error });

    await expect(fetchTask('task-3')).rejects.toThrow('database unavailable');
  });
});

describe('extractSettings', () => {
  it('returns grouped canonical restore settings', () => {
    const settings = extractSettings({
      params: {
        model_name: 'wan',
        input_images: ['"/image-a.png"'],
        structure_videos: [
          {
            path: '/guide.mp4',
            start_frame: 0,
            end_frame: 100,
            treatment: 'clip',
            metadata: { total_frames: 100 },
          },
        ],
        structure_guidance: {
          target: 'uni3c',
          strength: 1.4,
          step_window: [0.2, 0.6],
          videos: [
            {
              path: '/guide.mp4',
              start_frame: 0,
              end_frame: 100,
              treatment: 'clip',
            },
          ],
        },
      },
      orchestrator: {
        base_prompt: 'hello',
        negative_prompts_expanded: ['no'],
        segment_frames_expanded: [70],
        model_type: 'i2v',
      },
    });

    expect(settings.prompts).toEqual({
      prompt: 'hello',
      prompts: undefined,
      negativePrompt: 'no',
      negativePrompts: ['no'],
    });
    expect(settings.generation).toEqual(expect.objectContaining({
      frames: 70,
      model: 'wan',
    }));
    expect(settings.images.inputImages).toEqual(['/image-a.png']);
    expect(settings.modes).toEqual(expect.objectContaining({
      generationTypeMode: 'i2v',
    }));
    expect(settings.structure.presentInTask).toBe(true);
    expect(settings.structure.structureGuidance).toEqual(expect.objectContaining({
      target: 'uni3c',
      strength: 1.4,
    }));
    expect(settings.structure.structureVideos?.[0]).toEqual(expect.objectContaining({
      path: '/guide.mp4',
      treatment: 'clip',
      metadata: { total_frames: 100 },
    }));
    expect(settings.structure.structureVideos?.[0]).not.toHaveProperty('motion_strength');
  });

  it('upgrades legacy structure fields into the canonical structure restore contract', () => {
    const settings = extractSettings({
      params: {
        structure_video_path: '/legacy.mp4',
        structure_video_treatment: 'adjust',
        structure_video_motion_strength: 0.8,
        structure_type: 'depth',
        uni3c_end_percent: 0.4,
      },
      orchestrator: {},
    });

    expect(settings.structure.presentInTask).toBe(true);
    expect(settings.structure.structureGuidance).toEqual(expect.objectContaining({
      target: 'vace',
      preprocessing: 'depth',
      strength: 0.8,
    }));
    expect(settings.structure.structureVideos).toEqual([
      expect.objectContaining({
        path: '/legacy.mp4',
        treatment: 'adjust',
      }),
    ]);
    expect(settings.structure.structureVideos?.[0]).not.toHaveProperty('motion_strength');
    expect(settings.structure.structureVideos?.[0]).not.toHaveProperty('structure_type');
  });
});
