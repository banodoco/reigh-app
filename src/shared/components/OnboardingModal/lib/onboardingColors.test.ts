import { describe, expect, it } from 'vitest';
import { getStepColors } from './onboardingColors';

describe('getStepColors', () => {
  it('returns expected color mapping for first onboarding cycle', () => {
    expect(getStepColors(1)).toEqual({ bg: 'bg-accent', icon: 'text-primary' });
    expect(getStepColors(2)).toEqual({ bg: 'bg-secondary', icon: 'text-secondary-foreground' });
    expect(getStepColors(3)).toEqual({ bg: 'bg-muted', icon: 'text-foreground' });
    expect(getStepColors(4)).toEqual({ bg: 'bg-accent', icon: 'text-primary' });
    expect(getStepColors(5)).toEqual({ bg: 'bg-secondary', icon: 'text-secondary-foreground' });
    expect(getStepColors(6)).toEqual({ bg: 'bg-muted', icon: 'text-foreground' });
    expect(getStepColors(7)).toEqual({ bg: 'bg-accent', icon: 'text-primary' });
  });

  it('cycles colors after the configured palette length', () => {
    expect(getStepColors(8)).toEqual(getStepColors(1));
    expect(getStepColors(9)).toEqual(getStepColors(2));
    expect(getStepColors(14)).toEqual(getStepColors(7));
  });
});
