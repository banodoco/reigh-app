import { describe, expect, it } from 'vitest';
import { handleCascadingTaskFailure } from './cascade.ts';

describe('update-task-status/cascade exports', () => {
  it('exports cascading failure handler', () => {
    expect(handleCascadingTaskFailure).toBeTypeOf('function');
  });
});
