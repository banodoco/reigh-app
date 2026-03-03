import { describe, expect, it } from 'vitest';
import { buildSegmentMasterStateSnapshot } from './generation-child-diagnostics.ts';

describe('buildSegmentMasterStateSnapshot', () => {
  it('builds a diagnostic snapshot from orchestrator details and segment params', () => {
    const snapshot = buildSegmentMasterStateSnapshot({
      taskId: 'task-1',
      generationId: 'gen-1',
      segmentIndex: 1,
      parentGenerationId: 'parent-1',
      shotId: 'shot-1',
      orchestratorDetails: {
        input_image_paths_resolved: ['start-0.png', 'start-1.png', 'start-2.png'],
        pair_shot_generation_ids: ['pair-0', 'pair-1'],
        segment_frames_expanded: [24, 30, 36],
        structure_videos: ['s1.mp4'],
        base_prompts_expanded: ['p0', 'p1', 'p2'],
        negative_prompts_expanded: ['n0', 'n1', 'n2'],
      },
      segmentParams: {
        prompt: 'custom prompt',
      },
    });

    expect(snapshot.taskId).toBe('task-1');
    expect(snapshot.segmentIndex).toBe(1);
    expect(snapshot.prompt).toBe('custom prompt');
    expect(snapshot.negativePrompt).toBe('n1');
    expect(snapshot.startImageUrl).toBe('start-1.png');
    expect(snapshot.endImageUrl).toBe('start-2.png');
    expect(snapshot.pairShotGenerationId).toBe('pair-1');
    expect(snapshot.segmentFrameWindow).toEqual({ start: 24, end: 54 });
  });
});
