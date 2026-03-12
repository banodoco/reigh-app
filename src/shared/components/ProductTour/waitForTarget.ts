type ScheduleTimeout = (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;

interface ScheduleBoundedTargetWaitInput {
  delayMs: number;
  fallbackIndex: number;
  maxRetries: number;
  nextIndex: number;
  queryTarget: (selector: string) => Element | null;
  resumeDelayMs: number;
  scheduleTimeout: ScheduleTimeout;
  selector: string;
  setIsPaused: (value: boolean) => void;
  setStepIndex: (value: number) => void;
}

export function scheduleBoundedTargetWait({
  delayMs,
  fallbackIndex,
  maxRetries,
  nextIndex,
  queryTarget,
  resumeDelayMs,
  scheduleTimeout,
  selector,
  setIsPaused,
  setStepIndex,
}: ScheduleBoundedTargetWaitInput): void {
  const resumeTour = (targetIndex: number) => {
    setStepIndex(targetIndex);
    setIsPaused(false);
  };

  const waitForTarget = (attempt: number) => {
    if (queryTarget(selector)) {
      scheduleTimeout(() => resumeTour(nextIndex), resumeDelayMs);
      return;
    }

    if (attempt >= maxRetries) {
      resumeTour(fallbackIndex);
      return;
    }

    scheduleTimeout(() => waitForTarget(attempt + 1), resumeDelayMs);
  };

  scheduleTimeout(() => waitForTarget(0), delayMs);
}
