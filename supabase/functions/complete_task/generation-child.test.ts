import { describe, expect, it } from 'vitest';
import {
  handleChildGeneration,
  createSingleItemVariant,
  findExistingGenerationAtPosition,
  createChildGenerationRecord,
} from './generation-child.ts';

describe('complete_task/generation-child exports', () => {
  it('exports child generation handlers', () => {
    expect(handleChildGeneration).toBeTypeOf('function');
    expect(createSingleItemVariant).toBeTypeOf('function');
    expect(findExistingGenerationAtPosition).toBeTypeOf('function');
    expect(createChildGenerationRecord).toBeTypeOf('function');
  });
});
