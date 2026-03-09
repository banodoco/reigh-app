import { describe, expect, it } from 'vitest';
import { APP_BUTTON_SIZES, APP_BUTTON_VARIANTS } from './buttonThemeVariants';

describe('buttonThemeVariants', () => {
  it('exposes the themed button variants used by the shared button contract', () => {
    expect(Object.keys(APP_BUTTON_VARIANTS)).toEqual(
      expect.arrayContaining([
        'retro',
        'retro-secondary',
        'theme',
        'theme-ghost',
        'theme-outline',
        'theme-soft',
        'success',
      ]),
    );
    expect(APP_BUTTON_VARIANTS.retro).toContain('bg-retro');
    expect(APP_BUTTON_VARIANTS['theme-outline']).toContain('font-cocogoose');
    expect(APP_BUTTON_VARIANTS.success).toContain('from-secondary');
  });

  it('defines the themed size presets used by retro and theme buttons', () => {
    expect(Object.keys(APP_BUTTON_SIZES)).toEqual(
      expect.arrayContaining([
        'retro-sm',
        'retro-default',
        'retro-lg',
        'theme-sm',
        'theme-default',
        'theme-lg',
      ]),
    );
    expect(APP_BUTTON_SIZES['retro-default']).toContain('font-heading');
    expect(APP_BUTTON_SIZES['theme-lg']).toContain('rounded-2xl');
  });
});
