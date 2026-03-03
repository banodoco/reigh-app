import { describe, expect, it } from 'vitest';
import { requireContextValue } from './contextGuard';

describe('requireContextValue', () => {
  it('returns the context value when present', () => {
    const value = { userId: 'u1' };
    expect(requireContextValue(value, 'useAuth', 'AuthProvider')).toBe(value);
  });

  it('throws a provider guidance error when context is missing', () => {
    expect(() => requireContextValue(undefined, 'useAlpha', 'AlphaProvider')).toThrow(
      'useAlpha must be used within an AlphaProvider',
    );
    expect(() => requireContextValue(null, 'useBeta', 'BetaProvider')).toThrow(
      'useBeta must be used within a BetaProvider',
    );
  });
});
