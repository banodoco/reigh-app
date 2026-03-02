import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  extractAddInPositionParam,
  extractBasedOnParam,
  extractOrchestratorTaskIdParam,
  extractRunIdParam,
  extractShotIdParam,
} from '../taskParamContract';

describe('taskParamContract', () => {
  beforeEach(() => {
    vi.mocked(normalizeAndPresentError).mockClear();
  });

  it('extracts canonical and legacy string fields by precedence', () => {
    const params = {
      orchestration_contract: {
        orchestrator_task_id: 'orch-1',
        run_id: 'run-1',
      },
      based_on: 'gen-2',
      shot_id: 'shot-9',
    };

    expect(extractOrchestratorTaskIdParam(params)).toBe('orch-1');
    expect(extractRunIdParam(params)).toBe('run-1');
    expect(extractBasedOnParam(params)).toBe('gen-2');
    expect(extractShotIdParam(params)).toBe('shot-9');
  });

  it('rejects non-string values instead of coercing them into ids', () => {
    const params = {
      orchestration_contract: {
        orchestrator_task_id: 123,
        run_id: { nested: true },
      },
      based_on: ['gen-1'],
      shot_id: false,
    };

    expect(extractOrchestratorTaskIdParam(params)).toBeNull();
    expect(extractRunIdParam(params)).toBeNull();
    expect(extractBasedOnParam(params)).toBeNull();
    expect(extractShotIdParam(params)).toBeNull();
  });

  it('keeps boolean extraction behavior for add_in_position across common encodings', () => {
    expect(extractAddInPositionParam({ add_in_position: true })).toBe(true);
    expect(extractAddInPositionParam({ add_in_position: 1 })).toBe(true);
    expect(extractAddInPositionParam({ add_in_position: '1' })).toBe(true);
    expect(extractAddInPositionParam({ add_in_position: 0 })).toBe(false);
    expect(extractAddInPositionParam({ add_in_position: 'false' })).toBe(false);
  });

  it('rejects invalid numeric add_in_position values and emits telemetry', () => {
    expect(extractAddInPositionParam({ add_in_position: 2 })).toBe(false);
    expect(normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'TaskParamContract.addInPosition.invalid',
        showToast: false,
        logData: expect.objectContaining({
          rawType: 'number',
          rawValue: 2,
        }),
      }),
    );
  });
});
