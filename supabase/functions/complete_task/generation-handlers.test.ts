import { describe, expect, it } from 'vitest';
import {
  handleVariantCreation,
  handleVariantOnParent,
  handleVariantOnChild,
  handleStandaloneGeneration,
  handleChildGeneration,
} from './generation-handlers.ts';

describe('complete_task/generation-handlers exports', () => {
  it('exports generation handlers', () => {
    expect(handleVariantCreation).toBeTypeOf('function');
    expect(handleVariantOnParent).toBeTypeOf('function');
    expect(handleVariantOnChild).toBeTypeOf('function');
    expect(handleStandaloneGeneration).toBeTypeOf('function');
    expect(handleChildGeneration).toBeTypeOf('function');
  });
});
