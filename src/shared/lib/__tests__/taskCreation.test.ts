import { describe, it, expect } from 'vitest';
import {
  expandArrayToCount,
  validateRequiredFields,
  safeParseJson,
  buildHiresFixParams,
  generateRunId,
  generateTaskId,
  TaskValidationError,
  processBatchResults,
} from '../taskCreation';

describe('expandArrayToCount', () => {
  it('returns empty array for undefined', () => {
    expect(expandArrayToCount(undefined, 5)).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(expandArrayToCount([], 5)).toEqual([]);
  });

  it('expands single-element array to target count', () => {
    expect(expandArrayToCount(['a'], 3)).toEqual(['a', 'a', 'a']);
  });

  it('does not expand single-element when target is 1', () => {
    expect(expandArrayToCount(['a'], 1)).toEqual(['a']);
  });

  it('returns array as-is when length matches target', () => {
    expect(expandArrayToCount(['a', 'b', 'c'], 3)).toEqual(['a', 'b', 'c']);
  });

  it('truncates array when longer than target', () => {
    expect(expandArrayToCount(['a', 'b', 'c', 'd'], 2)).toEqual(['a', 'b']);
  });

  it('returns array as-is when shorter than target (not single)', () => {
    expect(expandArrayToCount(['a', 'b'], 5)).toEqual(['a', 'b']);
  });

  it('works with number arrays', () => {
    expect(expandArrayToCount([42], 3)).toEqual([42, 42, 42]);
  });
});

describe('validateRequiredFields', () => {
  it('passes when all fields present', () => {
    expect(() => {
      validateRequiredFields({ name: 'test', count: 5 }, ['name', 'count']);
    }).not.toThrow();
  });

  it('throws TaskValidationError for missing field', () => {
    expect(() => {
      validateRequiredFields({ name: 'test' }, ['name', 'count']);
    }).toThrow(TaskValidationError);
  });

  it('throws for null value', () => {
    expect(() => {
      validateRequiredFields({ name: null }, ['name']);
    }).toThrow(TaskValidationError);
  });

  it('throws for undefined value', () => {
    expect(() => {
      validateRequiredFields({ name: undefined }, ['name']);
    }).toThrow(TaskValidationError);
  });

  it('throws for empty string', () => {
    expect(() => {
      validateRequiredFields({ name: '' }, ['name']);
    }).toThrow(TaskValidationError);
  });

  it('throws for whitespace-only string', () => {
    expect(() => {
      validateRequiredFields({ name: '   ' }, ['name']);
    }).toThrow(TaskValidationError);
  });

  it('throws for empty array', () => {
    expect(() => {
      validateRequiredFields({ items: [] }, ['items']);
    }).toThrow(TaskValidationError);
  });

  it('passes for non-empty array', () => {
    expect(() => {
      validateRequiredFields({ items: [1, 2] }, ['items']);
    }).not.toThrow();
  });

  it('passes for zero (falsy but valid)', () => {
    expect(() => {
      validateRequiredFields({ count: 0 }, ['count']);
    }).not.toThrow();
  });

  it('passes for false (falsy but valid)', () => {
    expect(() => {
      validateRequiredFields({ enabled: false }, ['enabled']);
    }).not.toThrow();
  });

  it('includes field name in error', () => {
    try {
      validateRequiredFields({ name: null }, ['name']);
    } catch (err) {
      expect(err).toBeInstanceOf(TaskValidationError);
      expect((err as TaskValidationError).field).toBe('name');
    }
  });
});

describe('safeParseJson', () => {
  it('parses valid JSON', () => {
    expect(safeParseJson('{"key":"value"}', {})).toEqual({ key: 'value' });
  });

  it('returns fallback for undefined input', () => {
    expect(safeParseJson(undefined, { default: true })).toEqual({ default: true });
  });

  it('returns fallback for empty string', () => {
    expect(safeParseJson('', { default: true })).toEqual({ default: true });
  });

  it('returns fallback for invalid JSON', () => {
    expect(safeParseJson('not json', [])).toEqual([]);
  });

  it('parses arrays', () => {
    expect(safeParseJson('[1,2,3]', [])).toEqual([1, 2, 3]);
  });

  it('parses primitives', () => {
    expect(safeParseJson('42', 0)).toBe(42);
    expect(safeParseJson('"hello"', '')).toBe('hello');
    expect(safeParseJson('true', false)).toBe(true);
    expect(safeParseJson('null', 'fallback')).toBeNull();
  });
});

describe('buildHiresFixParams', () => {
  it('returns empty object for undefined', () => {
    expect(buildHiresFixParams(undefined)).toEqual({});
  });

  it('returns empty object for empty config', () => {
    expect(buildHiresFixParams({})).toEqual({});
  });

  it('includes only defined fields', () => {
    const result = buildHiresFixParams({
      hires_scale: 2,
      hires_steps: 10,
    });
    expect(result).toEqual({
      hires_scale: 2,
      hires_steps: 10,
    });
    expect(result).not.toHaveProperty('hires_denoise');
    expect(result).not.toHaveProperty('num_inference_steps');
  });

  it('includes all fields when all defined', () => {
    const result = buildHiresFixParams({
      num_inference_steps: 20,
      hires_scale: 2,
      hires_steps: 10,
      hires_denoise: 0.5,
      lightning_lora_strength_phase_1: 0.8,
      lightning_lora_strength_phase_2: 0.6,
      additional_loras: { lora1: '0.5' },
    });
    expect(result).toEqual({
      num_inference_steps: 20,
      hires_scale: 2,
      hires_steps: 10,
      hires_denoise: 0.5,
      lightning_lora_strength_phase_1: 0.8,
      lightning_lora_strength_phase_2: 0.6,
      additional_loras: { lora1: '0.5' },
    });
  });

  it('excludes empty additional_loras', () => {
    const result = buildHiresFixParams({
      hires_scale: 2,
      additional_loras: {},
    });
    expect(result).toEqual({ hires_scale: 2 });
    expect(result).not.toHaveProperty('additional_loras');
  });
});

describe('generateRunId', () => {
  it('returns a string', () => {
    expect(typeof generateRunId()).toBe('string');
  });

  it('contains only digits', () => {
    const runId = generateRunId();
    expect(runId).toMatch(/^\d+$/);
  });

  it('has reasonable length (ISO date stripped of separators)', () => {
    const runId = generateRunId();
    // "2025-02-13T12:34:56.789Z" -> "20250213123456789" = 17 chars
    expect(runId.length).toBeGreaterThanOrEqual(15);
    expect(runId.length).toBeLessThanOrEqual(20);
  });
});

describe('generateTaskId', () => {
  it('starts with the given prefix', () => {
    const id = generateTaskId('sm_travel_orchestrator');
    expect(id.startsWith('sm_travel_orchestrator_')).toBe(true);
  });

  it('contains timestamp-derived portion', () => {
    const id = generateTaskId('test');
    // Format: prefix_YYYYMMDD_shortUuid
    const parts = id.split('_');
    // Should have at least prefix + date + uuid parts
    expect(parts.length).toBeGreaterThanOrEqual(2);
  });

  it('generates unique IDs', () => {
    const id1 = generateTaskId('test');
    const id2 = generateTaskId('test');
    expect(id1).not.toBe(id2);
  });
});

describe('processBatchResults', () => {
  it('returns fulfilled results', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: { task_id: 't1', status: 'pending' } },
      { status: 'fulfilled', value: { task_id: 't2', status: 'pending' } },
    ];
    const processed = processBatchResults(results, 'Test');
    expect(processed).toEqual([
      { task_id: 't1', status: 'pending' },
      { task_id: 't2', status: 'pending' },
    ]);
  });

  it('throws when all fail', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'rejected', reason: new Error('fail 1') },
      { status: 'rejected', reason: new Error('fail 2') },
    ];
    expect(() => processBatchResults(results, 'Test')).toThrow('All batch tasks failed');
  });

  it('returns only fulfilled when some fail', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: { task_id: 't1', status: 'pending' } },
      { status: 'rejected', reason: new Error('fail') },
    ];
    const processed = processBatchResults(results, 'Test');
    expect(processed).toEqual([{ task_id: 't1', status: 'pending' }]);
  });
});

describe('TaskValidationError', () => {
  it('extends ValidationError', () => {
    const err = new TaskValidationError('bad input', 'field_name');
    expect(err.name).toBe('TaskValidationError');
    expect(err.message).toBe('bad input');
    expect(err.field).toBe('field_name');
  });
});
