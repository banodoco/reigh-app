import { describe, expect, it } from 'vitest';
import { composeTaskParams, composeTaskRequest } from '../taskRequestComposer';

describe('taskRequestComposer', () => {
  it('composes payloads from base, segments, and mapped fields', () => {
    const source = {
      project_id: 'project-1',
      shot_id: 'shot-1',
      prompt: 'hello',
      skip: '',
    };

    const params = composeTaskParams({
      source,
      baseParams: { task_id: 'task-1' },
      segments: [{ model: 'qwen' }, undefined, { seed: 123 }],
      mappedFields: [
        { from: 'shot_id' },
        { from: 'prompt' },
        { from: 'skip', include: (value) => typeof value === 'string' && value.length > 0 },
      ],
    });

    expect(params).toEqual({
      task_id: 'task-1',
      model: 'qwen',
      seed: 123,
      shot_id: 'shot-1',
      prompt: 'hello',
    });
  });

  it('builds canonical create-task requests', () => {
    const request = composeTaskRequest({
      source: { project_id: 'project-2' },
      taskType: 'join_clips_orchestrator',
      params: { prompt: 'join' },
    });

    expect(request).toEqual({
      project_id: 'project-2',
      task_type: 'join_clips_orchestrator',
      params: { prompt: 'join' },
    });
  });
});
