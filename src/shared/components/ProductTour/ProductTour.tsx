import {
  useEffect,
  useRef,
  useState,
  useCallback
} from 'react';
import { useNavigate } from 'react-router-dom';
import Joyride, { CallBackProps, STATUS, EVENTS, ACTIONS } from 'react-joyride';
import { TOUR_STEPS, tourSteps } from './tourSteps';
import { useProductTour } from '@/shared/hooks/useProductTour';
import { TOOL_ROUTES } from '@/shared/lib/toolRoutes';
import { usePanes } from '@/shared/contexts/PanesContext';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';
import { CustomTooltip } from './CustomTooltip';

const SHORT_DELAY_MS = 400;
const LONG_DELAY_MS = 1500;
const WAIT_FOR_TARGET_DELAY_MS = 800;
type ScheduleTimeout = (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;

function useManagedTimeouts() {
  const timeoutIdsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const scheduleTimeout = useCallback<ScheduleTimeout>((callback, delayMs) => {
    const timeoutId = setTimeout(() => {
      timeoutIdsRef.current.delete(timeoutId);
      callback();
    }, delayMs);
    timeoutIdsRef.current.add(timeoutId);
    return timeoutId;
  }, []);

  const clearScheduledTimeouts = useCallback(() => {
    for (const timeoutId of timeoutIdsRef.current) {
      clearTimeout(timeoutId);
    }
    timeoutIdsRef.current.clear();
  }, []);

  useEffect(() => () => {
    clearScheduledTimeouts();
  }, [clearScheduledTimeouts]);

  return { scheduleTimeout, clearScheduledTimeouts };
}

function pauseThenAdvance(
  nextIndex: number,
  setStepIndex: (value: number) => void,
  setIsPaused: (value: boolean) => void,
  delayMs: number,
  scheduleTimeout: ScheduleTimeout,
) {
  setIsPaused(true);
  scheduleTimeout(() => {
    setStepIndex(nextIndex);
    setIsPaused(false);
  }, delayMs);
}

function dispatchTourEvent(name: 'openGenerationModal' | 'closeGenerationModal') {
  dispatchAppEvent(name);
}

function useTourProgressState(isRunning: boolean, resetAllPaneLocks: () => void) {
  const [stepIndex, setStepIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (isRunning && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      setStepIndex(0);
      setIsPaused(false);
      resetAllPaneLocks();
    } else if (!isRunning) {
      hasInitializedRef.current = false;
    }
  }, [isRunning, resetAllPaneLocks]);

  return { stepIndex, setStepIndex, isPaused, setIsPaused };
}

function useSpotlightClickAdvance(input: {
  isRunning: boolean;
  isPaused: boolean;
  stepIndex: number;
  setStepIndex: (value: number) => void;
  setIsPaused: (value: boolean) => void;
  setIsTasksPaneLocked: (locked: boolean) => void;
  scheduleTimeout: ScheduleTimeout;
}) {
  const {
    isRunning,
    isPaused,
    stepIndex,
    setStepIndex,
    setIsPaused,
    setIsTasksPaneLocked,
    scheduleTimeout,
  } = input;

  useEffect(() => {
    if (!isRunning || isPaused) {
      return;
    }

    const currentStep = tourSteps[stepIndex];
    if (!currentStep?.spotlightClicks) {
      return;
    }

    const target = document.querySelector(currentStep.target as string);
    if (!target) {
      return;
    }

    const handleClick = () => {
      const nextIndex = stepIndex + 1;

      if (stepIndex === TOUR_STEPS.OPEN_FIRST_SHOT) {
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, LONG_DELAY_MS, scheduleTimeout);
        return;
      }

      if (stepIndex === TOUR_STEPS.TASKS_PANE) {
        setIsTasksPaneLocked(true);
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, SHORT_DELAY_MS, scheduleTimeout);
        return;
      }

      if (stepIndex === TOUR_STEPS.OPEN_GALLERY || stepIndex === TOUR_STEPS.GENERATE_IMAGES) {
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, SHORT_DELAY_MS, scheduleTimeout);
        return;
      }

      setStepIndex(nextIndex);
    };

    target.addEventListener('click', handleClick);
    return () => target.removeEventListener('click', handleClick);
  }, [isPaused, isRunning, scheduleTimeout, setIsPaused, setIsTasksPaneLocked, setStepIndex, stepIndex]);
}

function useJoyrideCallback(input: {
  completeTour: () => void;
  skipTour: () => void;
  setIsGenerationsPaneLocked: (locked: boolean) => void;
  setIsTasksPaneLocked: (locked: boolean) => void;
  setStepIndex: (value: number) => void;
  setIsPaused: (value: boolean) => void;
  navigate: (path: string) => void;
  scheduleTimeout: ScheduleTimeout;
}) {
  const {
    completeTour,
    skipTour,
    setIsGenerationsPaneLocked,
    setIsTasksPaneLocked,
    setStepIndex,
    setIsPaused,
    navigate,
    scheduleTimeout,
  } = input;

  return useCallback((data: CallBackProps) => {
    const { status, index, type, action } = data;

    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);

      if (index === TOUR_STEPS.OPEN_GALLERY && action !== ACTIONS.PREV) {
        setIsGenerationsPaneLocked(true);
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, SHORT_DELAY_MS, scheduleTimeout);
      } else if (index === TOUR_STEPS.GALLERY_SECTION && action !== ACTIONS.PREV) {
        setStepIndex(nextIndex);
      } else if (index === TOUR_STEPS.GENERATE_IMAGES && action !== ACTIONS.PREV) {
        dispatchTourEvent('openGenerationModal');
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, SHORT_DELAY_MS, scheduleTimeout);
      } else if (index === TOUR_STEPS.HOW_IT_WORKS && action !== ACTIONS.PREV) {
        dispatchTourEvent('closeGenerationModal');
        setIsGenerationsPaneLocked(false);
        setIsPaused(true);
        scheduleTimeout(() => {
          const waitForTarget = () => {
            const target = document.querySelector('[data-tour="first-shot"]');
            if (target) {
              setStepIndex(nextIndex);
              scheduleTimeout(() => setIsPaused(false), 100);
            } else {
              scheduleTimeout(waitForTarget, 100);
            }
          };
          waitForTarget();
        }, WAIT_FOR_TARGET_DELAY_MS);
      } else if (index === TOUR_STEPS.OPEN_FIRST_SHOT && action !== ACTIONS.PREV) {
        const firstShot = document.querySelector('[data-tour="first-shot"]') as HTMLElement;
        if (firstShot) {
          firstShot.click();
        }
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, LONG_DELAY_MS, scheduleTimeout);
      } else if (index === TOUR_STEPS.TASKS_PANE && action !== ACTIONS.PREV) {
        setIsTasksPaneLocked(true);
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, SHORT_DELAY_MS, scheduleTimeout);
      } else {
        setStepIndex(nextIndex);
      }
    }

    if (status === STATUS.FINISHED) {
      completeTour();
      navigate(TOOL_ROUTES.TRAVEL_BETWEEN_IMAGES);
    } else if (status === STATUS.SKIPPED) {
      skipTour();
    }
  }, [
    completeTour,
    navigate,
    setIsGenerationsPaneLocked,
    setIsPaused,
    setIsTasksPaneLocked,
    setStepIndex,
    scheduleTimeout,
    skipTour,
  ]);
}

export function ProductTour() {
  const { isRunning, completeTour, skipTour } = useProductTour();
  const { setIsGenerationsPaneLocked, setIsTasksPaneLocked, resetAllPaneLocks } = usePanes();
  const navigate = useNavigate();
  const { scheduleTimeout, clearScheduledTimeouts } = useManagedTimeouts();
  const { stepIndex, setStepIndex, isPaused, setIsPaused } = useTourProgressState(
    isRunning,
    resetAllPaneLocks
  );

  useEffect(() => {
    if (!isRunning) {
      clearScheduledTimeouts();
    }
  }, [clearScheduledTimeouts, isRunning]);

  useSpotlightClickAdvance({
    isRunning,
    isPaused,
    stepIndex,
    setStepIndex,
    setIsPaused,
    setIsTasksPaneLocked,
    scheduleTimeout,
  });

  const handleCallback = useJoyrideCallback({
    completeTour,
    skipTour,
    setIsGenerationsPaneLocked,
    setIsTasksPaneLocked,
    setStepIndex,
    setIsPaused,
    navigate,
    scheduleTimeout,
  });

  if (!isRunning) {
    return null;
  }

  return (
    <Joyride
      steps={tourSteps}
      run={isRunning && !isPaused}
      stepIndex={stepIndex}
      continuous
      scrollToFirstStep
      showSkipButton
      showProgress
      disableCloseOnEsc={false}
      disableOverlayClose
      callback={handleCallback}
      tooltipComponent={CustomTooltip}
      styles={{
        options: {
          zIndex: 100010,
          arrowColor: 'hsl(var(--background))',
        },
        spotlight: {
          borderRadius: 8,
          transition: 'opacity 0.3s ease, transform 0.3s ease',
        },
        overlay: {
          backgroundColor: 'hsl(0 0% 0% / 0.5)',
          transition: 'opacity 0.3s ease',
        },
      }}
      floaterProps={{
        styles: {
          floater: {
            filter: 'drop-shadow(0 4px 12px hsl(0 0% 0% / 0.15))',
            transition: 'opacity 0.3s ease, transform 0.3s ease',
          },
        },
      }}
    />
  );
}
