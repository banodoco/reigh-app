import { useEffect, useRef, useState } from 'react';
import { AstridSetupStep } from '@/shared/components/OnboardingModal/components/steps/AstridSetupStep';
import { CommunityStep } from '@/shared/components/OnboardingModal/components/steps/CommunityStep';
import { TextCaseStep } from '@/shared/components/OnboardingModal/components/steps/TextCaseStep';
import { TimeOfDayStep } from '@/shared/components/OnboardingModal/components/steps/TimeOfDayStep';
import type { OnboardingStepDefinition } from '@/shared/components/OnboardingModal/types';

/** First run: get the local Runtime going (blocking until it is), two quick appearance choices, then an
 *  optional invitation to the community that finishes on its own. */
const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  { id: 1, title: 'Set up', component: AstridSetupStep },
  { id: 2, title: 'Time of day', component: TimeOfDayStep },
  { id: 3, title: 'Text', component: TextCaseStep },
  { id: 4, title: 'Community', component: CommunityStep },
];

export function useOnboardingSteps(isOpen: boolean) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isShaking, setIsShaking] = useState(false);
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) {
        clearTimeout(shakeTimeoutRef.current);
      }
    };
  }, []);

  const handleNext = () => {
    setCurrentStep((previous) => Math.min(previous + 1, ONBOARDING_STEPS.length));
  };

  const handleBack = () => {
    setCurrentStep((previous) => Math.max(previous - 1, 1));
  };

  const handleShake = () => {
    setIsShaking(true);
    if (shakeTimeoutRef.current) {
      clearTimeout(shakeTimeoutRef.current);
    }
    shakeTimeoutRef.current = setTimeout(() => setIsShaking(false), 500);
  };

  const currentStepDefinition =
    ONBOARDING_STEPS[currentStep - 1] ?? ONBOARDING_STEPS[0];
  const stepTitles = ONBOARDING_STEPS.map((step) => step.title);

  return {
    currentStep,
    isShaking,
    handleNext,
    handleBack,
    handleShake,
    currentStepDefinition,
    stepTitles,
  };
}
