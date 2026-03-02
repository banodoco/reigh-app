import { describe, expect, it } from 'vitest';
import { isTaskDbRow, mapTaskDbRowToTask, type TaskDbRow } from './taskRowMapper';

describe('taskRowMapper', () => {
  it('validates task db rows with required and optional fields', () => {
    const validRow = {
      id: 'task-1',
      task_type: 'image',
      params: { prompt: 'cat' },
      status: 'Pending',
      dependant_on: ['task-0'],
      output_location: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T01:00:00.000Z',
      project_id: 'project-1',
      cost_cents: 25,
      generation_started_at: null,
      generation_processed_at: null,
      error_message: null,
    };

    expect(isTaskDbRow(validRow)).toBe(true);
    expect(isTaskDbRow({ ...validRow, dependant_on: [1, 2, 3] })).toBe(false);
    expect(isTaskDbRow({ ...validRow, cost_cents: '25' })).toBe(false);
    expect(isTaskDbRow({ ...validRow, id: 123 })).toBe(false);
  });

  it('maps db row fields to task shape with undefined for null optionals', () => {
    const row: TaskDbRow = {
      id: 'task-2',
      task_type: 'video',
      params: null,
      status: 'Completed',
      dependant_on: null,
      output_location: null,
      created_at: '2026-01-02T00:00:00.000Z',
      updated_at: null,
      project_id: 'project-2',
      cost_cents: null,
      generation_started_at: null,
      generation_processed_at: null,
      error_message: null,
    };

    const task = mapTaskDbRowToTask(row);

    expect(task).toEqual({
      id: 'task-2',
      taskType: 'video',
      params: {},
      status: 'Completed',
      dependantOn: undefined,
      outputLocation: undefined,
      createdAt: '2026-01-02T00:00:00.000Z',
      updatedAt: undefined,
      projectId: 'project-2',
      costCents: undefined,
      generationStartedAt: undefined,
      generationProcessedAt: undefined,
      errorMessage: undefined,
    });
  });

  it('maps object params through unchanged', () => {
    const row: TaskDbRow = {
      id: 'task-3',
      task_type: 'image',
      params: { seed: 42 },
      status: 'Processing',
      created_at: '2026-01-03T00:00:00.000Z',
      project_id: 'project-3',
    };

    const task = mapTaskDbRowToTask(row);

    expect(task.params).toEqual({ seed: 42 });
  });
});
