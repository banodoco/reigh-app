import { DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { TimeOfDayControl } from '@/shared/components/TimeOfDay/TimeOfDayControl';
import { OnboardingStepWithContinue } from '@/shared/components/OnboardingModal/components/OnboardingStepWithContinue';
import type { OnboardingStepProps } from '@/shared/components/OnboardingModal/types';

export function TimeOfDayStep({ onNext }: OnboardingStepProps) {
  return (
    <OnboardingStepWithContinue onNext={onNext}>
      <DialogHeader className="mb-6 space-y-3 text-center">
        <DialogTitle className="text-center text-2xl font-bold">What level of brightness would you like?</DialogTitle>
        <p className="text-center text-muted-foreground">
          Astrid can follow the time of day where you are, like its website: light by day, dark by night. Or keep
          it at one level. You can change it any time in settings.
        </p>
      </DialogHeader>
      <TimeOfDayControl />
    </OnboardingStepWithContinue>
  );
}
