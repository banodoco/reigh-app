import { describe, it, expect } from 'vitest';
import { APP_BUTTON_VARIANTS, APP_BUTTON_SIZES } from './buttonThemeVariants';

describe('buttonThemeVariants', () => {
  it('exports expected theme and retro variant keys', () => {
    expect(APP_BUTTON_VARIANTS.retro).toContain('bg-retro');
    expect(APP_BUTTON_VARIANTS['retro-secondary']).toContain('bg-transparent');
    expect(APP_BUTTON_VARIANTS.theme).toContain('theme-button');
    expect(APP_BUTTON_VARIANTS.success).toContain('from-secondary');
  });

  it('exports expected size presets', () => {
    expect(APP_BUTTON_SIZES['retro-sm']).toContain('h-9');
    expect(APP_BUTTON_SIZES['theme-default']).toContain('rounded-xl');
    expect(APP_BUTTON_SIZES['theme-lg']).toContain('h-14');
  });
});
