import { describe, expect, it } from 'vitest';
import { createGenerationFromTask } from './generation.ts';

describe('complete_task/generation exports', () => {
  it('exports generation router', () => {
    expect(createGenerationFromTask).toBeTypeOf('function');
  });
});
