import { describe, it, expect } from 'vitest';
import { GlobalProcessingWarning, TasksPaneProcessingWarning } from '../ProcessingWarnings';

describe('ProcessingWarnings', () => {
  it('exports expected members', () => {
    expect(GlobalProcessingWarning).toBeDefined();
    expect(TasksPaneProcessingWarning).toBeDefined();
  });
});
