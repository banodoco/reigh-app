import { describe, expect, it } from 'vitest';
import { parseGenerationTaskId } from '@/shared/lib/generationTaskIdParser';

describe('parseGenerationTaskId', () => {
  it('returns ok null for missing values', () => {
    expect(parseGenerationTaskId(null)).toEqual({ taskId: null, status: 'ok' });
    expect(parseGenerationTaskId(undefined)).toEqual({ taskId: null, status: 'ok' });
  });

  it('normalizes valid string task ids', () => {
    expect(parseGenerationTaskId('task-123')).toEqual({ taskId: 'task-123', status: 'ok' });
    expect(parseGenerationTaskId('  task-abc  ')).toEqual({ taskId: 'task-abc', status: 'ok' });
  });

  it('rejects empty or whitespace task id strings', () => {
    expect(parseGenerationTaskId('')).toEqual({ taskId: null, status: 'invalid_tasks_shape' });
    expect(parseGenerationTaskId('   ')).toEqual({ taskId: null, status: 'invalid_tasks_shape' });
  });

  it('parses canonical string[] task payloads', () => {
    expect(parseGenerationTaskId([])).toEqual({ taskId: null, status: 'ok' });
    expect(parseGenerationTaskId(['task-1'])).toEqual({ taskId: 'task-1', status: 'ok' });
    expect(parseGenerationTaskId(['  task-2  '])).toEqual({ taskId: 'task-2', status: 'ok' });
  });

  it('rejects semantically invalid array payloads', () => {
    expect(parseGenerationTaskId([''])).toEqual({ taskId: null, status: 'invalid_tasks_shape' });
    expect(parseGenerationTaskId(['   '])).toEqual({ taskId: null, status: 'invalid_tasks_shape' });
    expect(parseGenerationTaskId(['task-1', 42 as unknown as string])).toEqual({
      taskId: null,
      status: 'invalid_tasks_shape',
    });
  });
});
