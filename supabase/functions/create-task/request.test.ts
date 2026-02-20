import { describe, expect, it } from 'vitest';
import {
  buildTaskInsertObject,
  getErrorMessage,
  normalizeDependantOn,
  parseCreateTaskBody,
} from './request';

describe('normalizeDependantOn', () => {
  it('normalizes string input to one-element array', () => {
    expect(normalizeDependantOn(' task-1 ')).toEqual(['task-1']);
  });

  it('filters invalid array entries and returns null for empty result', () => {
    expect(normalizeDependantOn(['', '   ', null])).toBeNull();
  });

  it('normalizes mixed array input', () => {
    expect(normalizeDependantOn(['a', '  b  ', 5, undefined])).toEqual(['a', 'b']);
  });
});

describe('parseCreateTaskBody', () => {
  it('parses a valid request body', () => {
    const result = parseCreateTaskBody({
      task_id: 'task-123',
      params: { hello: 'world' },
      task_type: 'travel_orchestrator',
      project_id: 'project-1',
      dependant_on: ['dep-1', ' dep-2 '],
      idempotency_key: 'idem-1',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.task_id).toBe('task-123');
      expect(result.value.params).toEqual({ hello: 'world' });
      expect(result.value.task_type).toBe('travel_orchestrator');
      expect(result.value.project_id).toBe('project-1');
      expect(result.value.normalizedDependantOn).toEqual(['dep-1', 'dep-2']);
      expect(result.value.idempotency_key).toBe('idem-1');
    }
  });

  it('rejects missing required fields', () => {
    expect(parseCreateTaskBody({ task_type: 'x' })).toEqual({
      ok: false,
      error: 'params, task_type required',
    });
  });

  it('rejects invalid optional field types', () => {
    expect(parseCreateTaskBody({
      params: {},
      task_type: 'x',
      task_id: 42,
    })).toEqual({
      ok: false,
      error: 'task_id must be a non-empty string when provided',
    });

    expect(parseCreateTaskBody({
      params: {},
      task_type: 'x',
      idempotency_key: '',
    })).toEqual({
      ok: false,
      error: 'idempotency_key must be a non-empty string when provided',
    });
  });
});

describe('buildTaskInsertObject', () => {
  it('builds a canonical insert payload', () => {
    const parsed = parseCreateTaskBody({
      task_id: 'task-1',
      params: { p: 1 },
      task_type: 't',
      idempotency_key: 'idem',
      dependant_on: ['a', 'b'],
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const insert = buildTaskInsertObject({
      request: parsed.value,
      finalProjectId: 'project-final',
      now: new Date('2026-02-18T00:00:00.000Z'),
    });

    expect(insert).toEqual({
      id: 'task-1',
      params: { p: 1 },
      task_type: 't',
      project_id: 'project-final',
      dependant_on: ['a', 'b'],
      status: 'Queued',
      created_at: '2026-02-18T00:00:00.000Z',
      idempotency_key: 'idem',
    });
  });
});

describe('getErrorMessage', () => {
  it('handles Error, string, and unknown values', () => {
    expect(getErrorMessage(new Error('boom'))).toBe('boom');
    expect(getErrorMessage('oops')).toBe('oops');
    expect(getErrorMessage({ nope: true })).toBe('Unknown error');
  });
});
