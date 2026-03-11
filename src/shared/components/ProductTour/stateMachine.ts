import { ACTIONS } from 'react-joyride';
import { TOUR_STEPS } from './tourSteps';

export const SHORT_DELAY_MS = 400;
export const LONG_DELAY_MS = 1500;
export const WAIT_FOR_TARGET_DELAY_MS = 800;
export const WAIT_FOR_TARGET_RESUME_DELAY_MS = 100;

type TourEventName = 'openGenerationModal' | 'closeGenerationModal';

interface SpotlightAdvanceBehavior {
  delayMs?: number;
  lockTasksPane?: boolean;
}

type JoyrideAdvanceBehavior =
  | { type: 'advance' }
  | {
      type: 'pause';
      delayMs: number;
      dispatchEvent?: TourEventName;
      lockGenerationsPane?: boolean;
      lockTasksPane?: boolean;
    }
  | {
      type: 'waitForTarget';
      delayMs: number;
      selector: string;
      dispatchEvent?: TourEventName;
      releaseGenerationsPane?: boolean;
      resumeDelayMs: number;
    }
  | {
      type: 'clickThenPause';
      delayMs: number;
      selector: string;
    };

const SPOTLIGHT_ADVANCE_BEHAVIORS: Partial<Record<number, SpotlightAdvanceBehavior>> = {
  [TOUR_STEPS.OPEN_GALLERY]: { delayMs: SHORT_DELAY_MS },
  [TOUR_STEPS.GENERATE_IMAGES]: { delayMs: SHORT_DELAY_MS },
  [TOUR_STEPS.OPEN_FIRST_SHOT]: { delayMs: LONG_DELAY_MS },
  [TOUR_STEPS.TASKS_PANE]: { delayMs: SHORT_DELAY_MS, lockTasksPane: true },
};

const JOYRIDE_ADVANCE_BEHAVIORS: Partial<Record<number, JoyrideAdvanceBehavior>> = {
  [TOUR_STEPS.OPEN_GALLERY]: {
    type: 'pause',
    delayMs: SHORT_DELAY_MS,
    lockGenerationsPane: true,
  },
  [TOUR_STEPS.GALLERY_SECTION]: { type: 'advance' },
  [TOUR_STEPS.GENERATE_IMAGES]: {
    type: 'pause',
    delayMs: SHORT_DELAY_MS,
    dispatchEvent: 'openGenerationModal',
  },
  [TOUR_STEPS.HOW_IT_WORKS]: {
    type: 'waitForTarget',
    delayMs: WAIT_FOR_TARGET_DELAY_MS,
    selector: '[data-tour="first-shot"]',
    dispatchEvent: 'closeGenerationModal',
    releaseGenerationsPane: true,
    resumeDelayMs: WAIT_FOR_TARGET_RESUME_DELAY_MS,
  },
  [TOUR_STEPS.OPEN_FIRST_SHOT]: {
    type: 'clickThenPause',
    delayMs: LONG_DELAY_MS,
    selector: '[data-tour="first-shot"]',
  },
  [TOUR_STEPS.TASKS_PANE]: {
    type: 'pause',
    delayMs: SHORT_DELAY_MS,
    lockTasksPane: true,
  },
};

export function getSpotlightAdvanceBehavior(stepIndex: number): SpotlightAdvanceBehavior {
  return SPOTLIGHT_ADVANCE_BEHAVIORS[stepIndex] ?? {};
}

export function getJoyrideAdvanceBehavior(
  index: number,
  action: string,
): JoyrideAdvanceBehavior {
  if (action === ACTIONS.PREV) {
    return { type: 'advance' };
  }

  return JOYRIDE_ADVANCE_BEHAVIORS[index] ?? { type: 'advance' };
}
