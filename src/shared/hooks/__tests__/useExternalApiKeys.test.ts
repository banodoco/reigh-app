import { describe, expect, it } from 'vitest';
import { useHuggingFaceToken as compatHook } from '../../compat/hooks/useExternalApiKeys';
import { useHuggingFaceToken as canonicalHook } from '@/shared/services/externalApiKeys/hooks/useHuggingFaceToken';

describe('useExternalApiKeys compat shim', () => {
  it('re-exports the canonical service hook', () => {
    expect(compatHook).toBe(canonicalHook);
  });
});
