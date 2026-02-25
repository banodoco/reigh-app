import { dispatchAppEvent } from '@/shared/lib/typedEvents';
import { TOUR_SELECTORS } from './targets';

const SHORT_DELAY_MS = 400;
const LONG_DELAY_MS = 1500;
const WAIT_FOR_TARGET_DELAY_MS = 800;

const TOUR_STEP_INDEX = {
  OPEN_GALLERY: 0,
  GALLERY: 1,
  GENERATE: 2,
  HOW_IT_WORKS: 3,
  FIRST_SHOT: 4,
  TASKS_PANE: 8,
} as const;

type StepAdvanceRule = {
  delayMs?: number;
  lockGenerationsPane?: boolean;
  unlockGenerationsPane?: boolean;
  lockTasksPane?: boolean;
  openModal?: boolean;
  closeModal?: boolean;
  clickTargetSelector?: string;
  waitForTargetSelector?: string;
  waitDelayMs?: number;
};

export const SPOTLIGHT_CLICK_ADVANCE_RULES: Partial<Record<number, StepAdvanceRule>> = {
  [TOUR_STEP_INDEX.OPEN_GALLERY]: { delayMs: SHORT_DELAY_MS },
  [TOUR_STEP_INDEX.GENERATE]: { delayMs: SHORT_DELAY_MS },
  [TOUR_STEP_INDEX.FIRST_SHOT]: { delayMs: LONG_DELAY_MS },
  [TOUR_STEP_INDEX.TASKS_PANE]: { delayMs: SHORT_DELAY_MS, lockTasksPane: true },
};

export const STEP_AFTER_ADVANCE_RULES: Partial<Record<number, StepAdvanceRule>> = {
  [TOUR_STEP_INDEX.OPEN_GALLERY]: {
    lockGenerationsPane: true,
    delayMs: SHORT_DELAY_MS,
  },
  [TOUR_STEP_INDEX.GALLERY]: {},
  [TOUR_STEP_INDEX.GENERATE]: {
    openModal: true,
    delayMs: SHORT_DELAY_MS,
  },
  [TOUR_STEP_INDEX.HOW_IT_WORKS]: {
    closeModal: true,
    unlockGenerationsPane: true,
    waitForTargetSelector: TOUR_SELECTORS.firstShot,
    waitDelayMs: WAIT_FOR_TARGET_DELAY_MS,
  },
  [TOUR_STEP_INDEX.FIRST_SHOT]: {
    clickTargetSelector: TOUR_SELECTORS.firstShot,
    delayMs: LONG_DELAY_MS,
  },
  [TOUR_STEP_INDEX.TASKS_PANE]: {
    lockTasksPane: true,
    delayMs: SHORT_DELAY_MS,
  },
};

function pauseThenAdvance(
  nextIndex: number,
  setStepIndex: (value: number) => void,
  setIsPaused: (value: boolean) => void,
  delayMs: number,
) {
  setIsPaused(true);
  setTimeout(() => {
    setStepIndex(nextIndex);
    setIsPaused(false);
  }, delayMs);
}

function dispatchTourEvent(name: 'openGenerationModal' | 'closeGenerationModal') {
  dispatchAppEvent(name);
}

function waitForTargetThenAdvance(input: {
  selector: string;
  nextIndex: number;
  setStepIndex: (value: number) => void;
  setIsPaused: (value: boolean) => void;
  delayMs: number;
}) {
  const {
    selector,
    nextIndex,
    setStepIndex,
    setIsPaused,
    delayMs,
  } = input;

  setIsPaused(true);
  setTimeout(() => {
    const waitForTarget = () => {
      const target = document.querySelector(selector);
      if (target) {
        setStepIndex(nextIndex);
        setTimeout(() => setIsPaused(false), 100);
        return;
      }
      setTimeout(waitForTarget, 100);
    };
    waitForTarget();
  }, delayMs);
}

export function applyStepAdvanceRule(input: {
  rule: StepAdvanceRule;
  nextIndex: number;
  setStepIndex: (value: number) => void;
  setIsPaused: (value: boolean) => void;
  setIsGenerationsPaneLocked?: (locked: boolean) => void;
  setIsTasksPaneLocked?: (locked: boolean) => void;
}) {
  const {
    rule,
    nextIndex,
    setStepIndex,
    setIsPaused,
    setIsGenerationsPaneLocked,
    setIsTasksPaneLocked,
  } = input;

  if (rule.openModal) {
    dispatchTourEvent('openGenerationModal');
  }
  if (rule.closeModal) {
    dispatchTourEvent('closeGenerationModal');
  }
  if (rule.lockGenerationsPane) {
    setIsGenerationsPaneLocked?.(true);
  }
  if (rule.unlockGenerationsPane) {
    setIsGenerationsPaneLocked?.(false);
  }
  if (rule.lockTasksPane) {
    setIsTasksPaneLocked?.(true);
  }
  if (rule.clickTargetSelector) {
    const target = document.querySelector(rule.clickTargetSelector) as HTMLElement | null;
    target?.click();
  }

  if (rule.waitForTargetSelector) {
    waitForTargetThenAdvance({
      selector: rule.waitForTargetSelector,
      nextIndex,
      setStepIndex,
      setIsPaused,
      delayMs: rule.waitDelayMs ?? WAIT_FOR_TARGET_DELAY_MS,
    });
    return;
  }

  if (rule.delayMs && rule.delayMs > 0) {
    pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, rule.delayMs);
    return;
  }

  setStepIndex(nextIndex);
}
