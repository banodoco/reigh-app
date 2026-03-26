import { describe, expect, it } from 'vitest';
import { ServerError } from '@/shared/lib/errorHandling/errors';
import { parseTaskCreationResponse } from './parseTaskCreationResponse';

const context = {
  requestId: 'req-1',
  taskType: 'image',
  projectId: 'proj-1',
};

describe('parseTaskCreationResponse', () => {
  it('parses valid payloads and trims task ids', () => {
    const result = parseTaskCreationResponse(
      { task_id: '  task-123  ', status: 'queued' },
      context,
    );

    expect(result).toEqual({
      task_id: 'task-123',
      status: 'queued',
    });
  });

  it('defaults status to pending when status is missing or empty', () => {
    const result = parseTaskCreationResponse(
      { task_id: 'task-456', status: '   ' },
      context,
    );

    expect(result).toEqual({
      task_id: 'task-456',
      status: 'pending',
    });
  });

  it('parses batch payloads and preserves meta', () => {
    const result = parseTaskCreationResponse(
      {
        task_ids: [' task-1 ', 'task-2'],
        status: ' queued ',
        meta: { parentGenerationId: 'gen-1' },
      },
      context,
    );

    expect(result).toEqual({
      task_id: 'task-1',
      task_ids: ['task-1', 'task-2'],
      status: 'queued',
      meta: { parentGenerationId: 'gen-1' },
    });
  });

  it('throws ServerError for non-record payloads', () => {
    expect(() => parseTaskCreationResponse(null, context)).toThrow(ServerError);
    expect(() => parseTaskCreationResponse([], context)).toThrow(ServerError);
  });

  it('throws ServerError with inline message when task id is absent', () => {
    expect(() =>
      parseTaskCreationResponse(
        { error: ' Task queue unavailable ', status: 'failed' },
        context,
      ),
    ).toThrow('Task queue unavailable');
  });
});
