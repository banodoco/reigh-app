import { describe, expect, it } from 'vitest';
import {
  findExistingGeneration,
  findSourceGenerationByImageUrl,
  insertGeneration,
  createVariant,
  linkGenerationToShot,
} from './generation-core.ts';

describe('complete_task/generation-core exports', () => {
  it('exports core generation helpers', () => {
    expect(findExistingGeneration).toBeTypeOf('function');
    expect(findSourceGenerationByImageUrl).toBeTypeOf('function');
    expect(insertGeneration).toBeTypeOf('function');
    expect(createVariant).toBeTypeOf('function');
    expect(linkGenerationToShot).toBeTypeOf('function');
  });
});
