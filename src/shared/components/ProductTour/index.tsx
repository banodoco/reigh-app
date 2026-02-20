import {
  useEffect,
  useRef,
  useState,
  useCallback
} from 'react';
import { useNavigate } from 'react-router-dom';
import Joyride, { CallBackProps, STATUS, EVENTS, ACTIONS, TooltipRenderProps } from 'react-joyride';
import { tourSteps, tourStepColors } from './tourSteps';
import { useProductTour } from '@/shared/hooks/useProductTour';
import { TOOL_ROUTES } from '@/shared/lib/toolConstants';
import { usePanes } from '@/shared/contexts/PanesContext';
import {
  ChevronRight,
  ChevronLeft,
  Lock,
  Images,
  Sparkles,
  Lightbulb,
  Layout,
  Film,
  ListTodo,
  Wrench,
  PartyPopper,
  Layers
} from 'lucide-react';

// Icons for each step (matching the step content)
const stepIcons = [
  Lock,        // Step 0: Open gallery (lock button)
  Images,      // Step 1: Your image gallery
  Sparkles,    // Step 2: Generate images
  Lightbulb,   // Step 3: How it works
  Layout,      // Step 4: First shot (click to open)
  Film,        // Step 5: Video outputs
  Layers,      // Step 6: Timeline
  Film,        // Step 7: Structure video
  ListTodo,    // Step 8: Tasks pane
  Wrench,      // Step 9: Tools pane
  PartyPopper, // Step 10: Final step
];

// Custom tooltip component matching OnboardingModal aesthetic
function CustomTooltip({
  continuous,
  index,
  step,
  backProps,
  primaryProps,
  skipProps,
  tooltipProps,
  isLastStep,
  size,
}: TooltipRenderProps) {
  const colors = tourStepColors[index % tourStepColors.length];
  const Icon = stepIcons[index] || PartyPopper;
  const totalSteps = size;

  return (
    <div
      {...tooltipProps}
      className="bg-background border border-border rounded-lg shadow-lg p-4 max-w-xs z-[100011] animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
    >
      {/* Header with colored icon */}
      <div className="text-center space-y-2 mb-3">
        <div className={`mx-auto w-8 h-8 ${colors.bg} rounded-full flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${colors.icon}`} />
        </div>
        {step.title && (
          <h3 className="text-base font-semibold text-center text-foreground">
            {step.title as string}
          </h3>
        )}
      </div>

      {/* Content */}
      <div className="text-center mb-3">
        <p className="text-sm text-muted-foreground">{step.content as string}</p>
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between items-center">
        {index > 0 ? (
          <button
            {...backProps}
            className="flex items-center gap-x-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
            <span>Back</span>
          </button>
        ) : (
          <button
            {...skipProps}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip
          </button>
        )}

        {continuous && (
          <button
            {...primaryProps}
            className="flex items-center gap-x-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <span>{isLastStep ? "Done" : 'Next'}</span>
            {!isLastStep && <ChevronRight className="h-3 w-3" />}
          </button>
        )}
      </div>

      {/* Step indicators */}
      <div className="flex justify-center gap-x-1.5 pt-3 border-t border-border mt-3">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i === index ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

const SHORT_DELAY_MS = 400;
const LONG_DELAY_MS = 1500;
const WAIT_FOR_TARGET_DELAY_MS = 800;

function pauseThenAdvance(
  nextIndex: number,
  setStepIndex: (value: number) => void,
  setIsPaused: (value: boolean) => void,
  delayMs: number
) {
  setIsPaused(true);
  setTimeout(() => {
    setStepIndex(nextIndex);
    setIsPaused(false);
  }, delayMs);
}

function dispatchTourEvent(name: 'openGenerationModal' | 'closeGenerationModal') {
  window.dispatchEvent(new CustomEvent(name));
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
}) {
  const {
    isRunning,
    isPaused,
    stepIndex,
    setStepIndex,
    setIsPaused,
    setIsTasksPaneLocked,
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

      if (stepIndex === 4) {
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, LONG_DELAY_MS);
        return;
      }

      if (stepIndex === 8) {
        setIsTasksPaneLocked(true);
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, SHORT_DELAY_MS);
        return;
      }

      if (stepIndex === 0 || stepIndex === 2) {
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, SHORT_DELAY_MS);
        return;
      }

      setStepIndex(nextIndex);
    };

    target.addEventListener('click', handleClick);
    return () => target.removeEventListener('click', handleClick);
  }, [isPaused, isRunning, setIsPaused, setIsTasksPaneLocked, setStepIndex, stepIndex]);
}

function useJoyrideCallback(input: {
  completeTour: () => void;
  skipTour: () => void;
  setIsGenerationsPaneLocked: (locked: boolean) => void;
  setIsTasksPaneLocked: (locked: boolean) => void;
  setStepIndex: (value: number) => void;
  setIsPaused: (value: boolean) => void;
  navigate: (path: string) => void;
}) {
  const {
    completeTour,
    skipTour,
    setIsGenerationsPaneLocked,
    setIsTasksPaneLocked,
    setStepIndex,
    setIsPaused,
    navigate,
  } = input;

  return useCallback((data: CallBackProps) => {
    const { status, index, type, action } = data;

    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const nextIndex = index + (action === ACTIONS.PREV ? -1 : 1);

      if (index === 0 && action !== ACTIONS.PREV) {
        setIsGenerationsPaneLocked(true);
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, SHORT_DELAY_MS);
      } else if (index === 1 && action !== ACTIONS.PREV) {
        setStepIndex(nextIndex);
      } else if (index === 2 && action !== ACTIONS.PREV) {
        dispatchTourEvent('openGenerationModal');
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, SHORT_DELAY_MS);
      } else if (index === 3 && action !== ACTIONS.PREV) {
        dispatchTourEvent('closeGenerationModal');
        setIsGenerationsPaneLocked(false);
        setIsPaused(true);
        setTimeout(() => {
          const waitForTarget = () => {
            const target = document.querySelector('[data-tour="first-shot"]');
            if (target) {
              setStepIndex(nextIndex);
              setTimeout(() => setIsPaused(false), 100);
            } else {
              setTimeout(waitForTarget, 100);
            }
          };
          waitForTarget();
        }, WAIT_FOR_TARGET_DELAY_MS);
      } else if (index === 4 && action !== ACTIONS.PREV) {
        const firstShot = document.querySelector('[data-tour="first-shot"]') as HTMLElement;
        if (firstShot) {
          firstShot.click();
        }
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, LONG_DELAY_MS);
      } else if (index === 8 && action !== ACTIONS.PREV) {
        setIsTasksPaneLocked(true);
        pauseThenAdvance(nextIndex, setStepIndex, setIsPaused, SHORT_DELAY_MS);
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
    skipTour,
  ]);
}

export function ProductTour() {
  const { isRunning, completeTour, skipTour } = useProductTour();
  const { setIsGenerationsPaneLocked, setIsTasksPaneLocked, resetAllPaneLocks } = usePanes();
  const navigate = useNavigate();
  const { stepIndex, setStepIndex, isPaused, setIsPaused } = useTourProgressState(
    isRunning,
    resetAllPaneLocks
  );

  useSpotlightClickAdvance({
    isRunning,
    isPaused,
    stepIndex,
    setStepIndex,
    setIsPaused,
    setIsTasksPaneLocked,
  });

  const handleCallback = useJoyrideCallback({
    completeTour,
    skipTour,
    setIsGenerationsPaneLocked,
    setIsTasksPaneLocked,
    setStepIndex,
    setIsPaused,
    navigate,
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
