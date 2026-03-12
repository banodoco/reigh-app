import { ACTIONS } from 'react-joyride';
import { describe, expect, it } from 'vitest';
import {
  LONG_DELAY_MS,
  SHORT_DELAY_MS,
  WAIT_FOR_TARGET_DELAY_MS,
  WAIT_FOR_TARGET_MAX_RETRIES,
  WAIT_FOR_TARGET_RESUME_DELAY_MS,
  getJoyrideAdvanceBehavior,
  getSpotlightAdvanceBehavior,
} from './stateMachine';
import { TOUR_STEPS } from './tourSteps';

describe('product tour state machine', () => {
  it('returns keyed spotlight behaviors for interactive steps', () => {
    expect(getSpotlightAdvanceBehavior(TOUR_STEPS.OPEN_FIRST_SHOT)).toEqual({
      delayMs: LONG_DELAY_MS,
    });
    expect(getSpotlightAdvanceBehavior(TOUR_STEPS.TASKS_PANE)).toEqual({
      delayMs: SHORT_DELAY_MS,
      lockTasksPane: true,
    });
  });

  it('returns keyed joyride behaviors for forward navigation', () => {
    expect(getJoyrideAdvanceBehavior(TOUR_STEPS.OPEN_GALLERY, ACTIONS.NEXT)).toEqual({
      type: 'pause',
      delayMs: SHORT_DELAY_MS,
      lockGenerationsPane: true,
    });
    expect(getJoyrideAdvanceBehavior(TOUR_STEPS.GENERATE_IMAGES, ACTIONS.NEXT)).toEqual({
      type: 'pause',
      delayMs: SHORT_DELAY_MS,
      dispatchEvent: 'openGenerationModal',
    });
    expect(getJoyrideAdvanceBehavior(TOUR_STEPS.HOW_IT_WORKS, ACTIONS.NEXT)).toEqual({
      type: 'waitForTarget',
      delayMs: WAIT_FOR_TARGET_DELAY_MS,
      maxRetries: WAIT_FOR_TARGET_MAX_RETRIES,
      selector: '[data-tour="first-shot"]',
      dispatchEvent: 'closeGenerationModal',
      releaseGenerationsPane: true,
      resumeDelayMs: WAIT_FOR_TARGET_RESUME_DELAY_MS,
    });
  });

  it('falls back to a plain advance on backward navigation or unconfigured steps', () => {
    expect(getJoyrideAdvanceBehavior(TOUR_STEPS.OPEN_GALLERY, ACTIONS.PREV)).toEqual({
      type: 'advance',
    });
    expect(getJoyrideAdvanceBehavior(TOUR_STEPS.TOOLS_PANE, ACTIONS.NEXT)).toEqual({
      type: 'advance',
    });
  });
});
