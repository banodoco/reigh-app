import { DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useTextCase } from '@/shared/hooks/useTextCase';
import type { OnboardingStepProps } from '@/shared/components/OnboardingModal/types';


/** How the person's own text (project names, shot names, prompts) is shown. */
export function TextCaseStep({ onNext }: OnboardingStepProps) {
  const { preserveUserText, setPreserveUserText } = useTextCase();
  const options = [
    // Each option is written the way it would show the person's text.
    { preserve: false, title: 'all lowercase', note: 'calm and uniform' },
    { preserve: true, title: 'Original case', note: 'Exactly as you typed it' },
  ];
  return (
    <>
      <DialogHeader className="mb-6 space-y-3 text-center">
        <DialogTitle className="text-center text-2xl font-bold">How should your text look?</DialogTitle>
        <p className="text-center text-muted-foreground">
          For your project names, shot names and prompts. Astrid’s own labels are written in sentence case either way.
        </p>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Text case">
        {options.map((option) => {
          const selected = preserveUserText === option.preserve;
          return (
            <button
              key={option.title}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreserveUserText(option.preserve)}
              className={`rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
            >
              <span className="verbatim-case block text-base font-medium">{option.title}</span>
              <span className="verbatim-case mt-1 block text-sm text-muted-foreground">{option.note}</span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-center pt-6 pb-2">
        <Button variant="retro" size="retro-sm" onClick={onNext} className="w-full sm:w-auto">
          Continue
        </Button>
      </div>
    </>
  );
}
