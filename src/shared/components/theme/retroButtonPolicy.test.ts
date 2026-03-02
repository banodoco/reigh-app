import { describe, expect, it } from 'vitest';
import {
  isRetroButtonSize,
  isRetroButtonVariant,
  retroButtonPolicy,
} from './retroButtonPolicy';

describe('retroButtonPolicy', () => {
  it('applies default retro classes when no variants are provided', () => {
    const classes = retroButtonPolicy();

    expect(classes).toContain('bg-retro');
    expect(classes).toContain('h-11');
    expect(classes).toContain('font-heading');
  });

  it('validates supported retro button variants', () => {
    expect(isRetroButtonVariant('retro')).toBe(true);
    expect(isRetroButtonVariant('retro-secondary')).toBe(true);
    expect(isRetroButtonVariant('primary')).toBe(false);
    expect(isRetroButtonVariant(null)).toBe(false);
  });

  it('validates supported retro button sizes', () => {
    expect(isRetroButtonSize('retro-sm')).toBe(true);
    expect(isRetroButtonSize('retro-default')).toBe(true);
    expect(isRetroButtonSize('retro-lg')).toBe(true);
    expect(isRetroButtonSize('lg')).toBe(false);
    expect(isRetroButtonSize(undefined)).toBe(false);
  });
});
