import { describe, expect, it } from 'vitest';
import { normalizeTaskDetailsPayload, pickTaskDetailsString } from './normalizeTaskDetailsPayload';
import type { Task } from '@/types/tasks';

function createTask(params: Record<string, unknown>): Task {
  return {
    id: 'task-1',
    task_type: 'image_generation',
    status: 'Complete',
    params,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    project_id: 'project-1',
  } as unknown as Task;
}

describe('normalizeTaskDetailsPayload', () => {
  it('returns empty normalized fields for null tasks', () => {
    const normalized = normalizeTaskDetailsPayload(null);
    expect(normalized.parsedParams).toEqual({});
    expect(normalized.orchestratorDetails).toEqual({});
    expect(normalized.orchestratorPayload).toEqual({});
    expect(normalized.inputImages).toEqual([]);
  });

  it('cleans surrounding quote characters from derived input image URLs', () => {
    const task = createTask({
      input_images: ['"https://cdn.example.com/a.png"', "'https://cdn.example.com/b.png'"],
    });

    const normalized = normalizeTaskDetailsPayload(task);
    expect(normalized.inputImages).toEqual([
      'https://cdn.example.com/a.png',
      'https://cdn.example.com/b.png',
    ]);
  });

  it('picks detail strings by precedence: parsed params -> orchestrator details -> payload', () => {
    const task = createTask({
      top_value: 'top',
      orchestrator_details: { details_value: 'details', shared_value: 'details-shared' },
      full_orchestrator_payload: { payload_value: 'payload', shared_value: 'payload-shared' },
      shared_value: 'top-shared',
    });

    const normalized = normalizeTaskDetailsPayload(task);
    expect(pickTaskDetailsString(normalized, 'shared_value')).toBe('top-shared');
    expect(pickTaskDetailsString(normalized, 'details_value')).toBe('details');
    expect(pickTaskDetailsString(normalized, 'payload_value')).toBe('payload');
  });
});
