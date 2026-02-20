import { describe, expect, it } from 'vitest';
import { usePaymentVerification } from './usePaymentVerification';

describe('usePaymentVerification module', () => {
  it('exports hook', () => {
    expect(usePaymentVerification).toBeDefined();
  });
});
