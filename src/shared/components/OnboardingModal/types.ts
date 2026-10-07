export interface OnboardingModalProps {
  isOpen: boolean;
  /** `reconnect` shows only the "start your Runtime" step (see useOnboarding). */
  mode?: 'first-run' | 'reconnect';
  onClose: () => void;
}

export interface OnboardingStepProps {
  onNext: () => void;
  onClose: () => void;
}

type OnboardingStepComponent = React.ComponentType<OnboardingStepProps>;

export interface OnboardingStepDefinition {
  id: number;
  title: string;
  component: OnboardingStepComponent;
}
