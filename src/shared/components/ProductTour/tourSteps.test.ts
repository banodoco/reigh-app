import { describe, it, expect } from 'vitest';
import { tourStepColors, tourSteps } from './tourSteps';

describe('tourSteps', () => {
  it('defines a stable set of tour step colors', () => {
    expect(tourStepColors.length).toBeGreaterThanOrEqual(10);
    for (const color of tourStepColors) {
      expect(color.bg).toContain('bg-');
      expect(color.icon).toContain('text-');
    }
  });

  it('contains an ordered guided flow with explicit first and last steps', () => {
    expect(tourSteps.length).toBeGreaterThanOrEqual(10);
    expect(tourSteps[0]?.target).toBe('[data-tour="generations-lock"]');
    expect(tourSteps[tourSteps.length - 1]?.title).toBe('Ready to Create!');
  });
});
