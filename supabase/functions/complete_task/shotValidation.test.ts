import { describe, expect, it } from 'vitest';
import { validateAndCleanupShotId } from './shotValidation.ts';

describe('complete_task/shotValidation exports', () => {
  it('exports shot validation helper', () => {
    expect(validateAndCleanupShotId).toBeTypeOf('function');
  });
});
