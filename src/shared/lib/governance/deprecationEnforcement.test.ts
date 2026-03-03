import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signalPastRemovalTargetUsage } from './deprecationEnforcement';
import type { DeprecationPolicy } from './deprecationPolicy';
import { isPastRemovalTarget } from './deprecationPolicy';
import {
  normalizeAndPresentAndRethrow,
  normalizeAndPresentError,
} from '@/shared/lib/errorHandling/runtimeError';

vi.mock('./deprecationPolicy', () => ({
  isPastRemovalTarget: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentAndRethrow: vi.fn(),
  normalizeAndPresentError: vi.fn(),
}));

const basePolicy: DeprecationPolicy = {
  owner: 'owner-team',
  removeBy: '2026-01-31',
  importBudgetPhases: [],
};

describe('deprecationEnforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false without signaling when removal target has not passed', () => {
    vi.mocked(isPastRemovalTarget).mockReturnValue(false);

    const result = signalPastRemovalTargetUsage({
      alias: 'legacy-api-a',
      policy: basePolicy,
      remediation: 'Use newApi().',
    });

    expect(result).toBe(false);
    expect(normalizeAndPresentError).not.toHaveBeenCalled();
    expect(normalizeAndPresentAndRethrow).not.toHaveBeenCalled();
  });

  it('signals once per alias/removeBy key in warn mode', () => {
    vi.mocked(isPastRemovalTarget).mockReturnValue(true);

    const first = signalPastRemovalTargetUsage({
      alias: 'legacy-api-b',
      policy: { ...basePolicy, removeBy: '2026-02-01' },
      enforcement: 'warn',
    });
    const second = signalPastRemovalTargetUsage({
      alias: 'legacy-api-b',
      policy: { ...basePolicy, removeBy: '2026-02-01' },
      enforcement: 'warn',
    });

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(normalizeAndPresentError).toHaveBeenCalledTimes(1);
    expect(normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'deprecationEnforcement.signalPastRemovalTargetUsage',
        showToast: false,
        logData: expect.objectContaining({
          alias: 'legacy-api-b',
          mode: 'warn',
        }),
      }),
    );
  });

  it('throws via runtime reporter in throw mode', () => {
    vi.mocked(isPastRemovalTarget).mockReturnValue(true);
    vi.mocked(normalizeAndPresentAndRethrow).mockImplementation(() => {
      throw new Error('forced throw');
    });

    expect(() =>
      signalPastRemovalTargetUsage({
        alias: 'legacy-api-c',
        policy: { ...basePolicy, removeBy: '2026-02-02' },
        enforcement: 'throw',
      }),
    ).toThrow('forced throw');

    expect(normalizeAndPresentAndRethrow).toHaveBeenCalledTimes(1);
  });
});
