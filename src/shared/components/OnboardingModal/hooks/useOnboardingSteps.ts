import { useEffect, useRef, useState } from 'react';
import { CommunityStep } from '@/shared/components/OnboardingModal/components/steps/CommunityStep';
import { IntroductionStep } from '@/shared/components/OnboardingModal/components/steps/IntroductionStep';
import { SetupCompleteStep } from '@/shared/components/OnboardingModal/components/steps/SetupCompleteStep';
import { ThemeStep } from '@/shared/components/OnboardingModal/components/steps/ThemeStep';
import type { OnboardingStepDefinition } from '@/shared/components/OnboardingModal/types';

const ONBOARDING_STEPS: OnboardingStepDefinition[] = [
  { id: 1, title: 'Welcome', component: IntroductionStep },
  { id: 2, title: 'Community', component: CommunityStep },
  { id: 3, title: 'Theme', component: ThemeStep },
  { id: 4, title: 'Complete', component: SetupCompleteStep },
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
