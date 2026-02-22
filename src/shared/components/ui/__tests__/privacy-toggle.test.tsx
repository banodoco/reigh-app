import { describe, it, expect } from 'vitest';
import { PrivacyToggle, privacyToggleVariants, privacyToggleButtonVariants } from '../privacy-toggle';

describe('privacy-toggle', () => {
  it('exports expected members', () => {
    expect(PrivacyToggle).toBeDefined();
    expect(privacyToggleVariants).toBeDefined();
    expect(privacyToggleButtonVariants).toBeDefined();
  });
});
