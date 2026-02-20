import { describe, expect, it } from 'vitest';
import { checkOrchestratorCompletion } from './orchestrator.ts';

describe('complete_task/orchestrator exports', () => {
  it('exports orchestrator completion checker', () => {
    expect(checkOrchestratorCompletion).toBeTypeOf('function');
  });
});
