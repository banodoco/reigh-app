import { describe, it, expect } from 'vitest';
import { useLightboxVariantBadges } from '../useLightboxVariantBadges';

describe('useLightboxVariantBadges', () => {
  it('exports expected members', () => {
    expect(useLightboxVariantBadges).toBeDefined();
  });

  it('useLightboxVariantBadges is a callable function', () => {
    expect(typeof useLightboxVariantBadges).toBe('function');
    expect(useLightboxVariantBadges.name).toBeDefined();
  });
});
