import { describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { buildVideoEditOrchestratorDetails } from './videoEditingTaskPayload';

const mocks = vi.hoisted(() => ({
  generateRunId: vi.fn(() => 'run-1'),
  getGenerationId: vi.fn(() => 'parent-generation-1'),
}));

vi.mock('@/shared/lib/taskCreation', () => ({
  generateRunId: (...args: unknown[]) => mocks.generateRunId(...args),
}));

vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({
  getGenerationId: (...args: unknown[]) => mocks.getGenerationId(...args),
}));

describe('buildVideoEditOrchestratorDetails', () => {
  it('builds orchestrator payload with context clamped by keeper frames and mapped resolution', () => {
    const payload = buildVideoEditOrchestratorDetails({
      media: { id: 'media-1' } as unknown as GenerationRow,
      videoUrl: 'https://cdn.example.com/video.mp4',
      videoDuration: 10,
      fps: 10,
      portionFrameRanges: [
        {
          start_frame: 20,
          end_frame: 30,
          start_time_seconds: 2,
          end_time_seconds: 3,
          frame_count: 10,
          gap_frame_count: 8,
          prompt: 'first',
        },
        {
          start_frame: 40,
          end_frame: 50,
          start_time_seconds: 4,
          end_time_seconds: 5,
          frame_count: 10,
          gap_frame_count: 8,
          prompt: 'second',
        },
      ],
      projectAspectRatio: '4:3',
      requestedContextFrameCount: 15,
      globalGapFrameCount: 12,
      globalPrompt: 'global prompt',
      negativePrompt: 'negative',
      enhancePrompt: true,
      priority: 7,
      model: 'vace-model-x',
      seed: 42,
      numInferenceSteps: 20,
      guidanceScale: 6.5,
      lorasForTask: [],
    });

    expect(payload).toEqual(
      expect.objectContaining({
        run_id: 'run-1',
        tool_type: TOOL_IDS.EDIT_VIDEO,
        source_video_total_frames: 100,
        context_frame_count: 9,
        resolution: [768, 576],
        model: 'vace-model-x',
        parent_generation_id: 'parent-generation-1',
        prompt: 'global prompt',
      }),
    );
    expect(payload).not.toHaveProperty('loras');
  });

  it('falls back to default resolution and includes loras when provided', () => {
    const payload = buildVideoEditOrchestratorDetails({
      media: { id: 'media-2' } as unknown as GenerationRow,
      videoUrl: 'https://cdn.example.com/video-2.mp4',
      videoDuration: 8,
      fps: 16,
      portionFrameRanges: [
        {
          start_frame: 10,
          end_frame: 20,
          start_time_seconds: 0.625,
          end_time_seconds: 1.25,
          frame_count: 10,
          gap_frame_count: 6,
          prompt: '',
        },
      ],
      projectAspectRatio: 'invalid-aspect',
      requestedContextFrameCount: 6,
      globalGapFrameCount: 10,
      globalPrompt: 'global',
      negativePrompt: '',
      enhancePrompt: false,
      priority: 1,
      model: undefined,
      seed: 99,
      numInferenceSteps: 12,
      guidanceScale: 4,
      lorasForTask: [
        { path: 'https://example.com/a.safetensors', strength: 0.7 },
      ],
    });

    expect(payload).toEqual(
      expect.objectContaining({
        resolution: [902, 508],
        loras: [{ path: 'https://example.com/a.safetensors', strength: 0.7 }],
      }),
    );
  });
});
