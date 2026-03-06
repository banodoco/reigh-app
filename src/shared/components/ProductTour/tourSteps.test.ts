import { describe, it, expect } from 'vitest';
import { TOUR_STEPS, tourStepColors, tourSteps } from './tourSteps';

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
    expect(tourSteps[TOUR_STEPS.OPEN_GALLERY]?.target).toBe('[data-tour="generations-lock"]');
    expect(tourSteps[TOUR_STEPS.READY_TO_CREATE]?.title).toBe('Ready to Create!');
  });
});
