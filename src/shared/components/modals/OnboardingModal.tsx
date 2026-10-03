import React from 'react';
import { Dialog, DialogContent } from '@/shared/components/ui/dialog';
import { ChevronLeft } from 'lucide-react';
import { useLargeModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';
import { useOnboardingSteps } from '@/shared/components/OnboardingModal/hooks/useOnboardingSteps';
import type { OnboardingModalProps } from '@/shared/components/OnboardingModal/types';
import { AstridSetupStep, SetupFooterStatus } from '@/shared/components/OnboardingModal/components/steps/AstridSetupStep';

/** With ?skip-setup in the address, the setup step offers a way past it (for testing the later steps
 *  without a running Runtime). */
export function wantsSetupSkip(): boolean {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('skip-setup');
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  mode = 'first-run',
  onClose,
}) => {
  const reconnect = mode === 'reconnect';
  // Large: setup shows commands and a brief that need room to read.
  const modal = useLargeModal();
  const { showFade, scrollRef } = useScrollFade({
    isOpen,
    preloadFade: modal.isMobile,
  });
  const {
    currentStep,
    isShaking,
    handleNext,
    handleBack,
    handleShake,
    currentStepDefinition,
    stepTitles,
  } = useOnboardingSteps(isOpen);

  const CurrentStepComponent = currentStepDefinition.component;

  return (
    <Dialog open={isOpen} onOpenChange={handleShake}>
      <DialogContent className={modal.className} style={modal.style}>
        <style>
          {`
            @keyframes shake {
              0%, 100% { transform: translateX(0); }
              10%, 30%, 50%, 70%, 90% { transform: translateX(-8px); }
              20%, 40%, 60%, 80% { transform: translateX(8px); }
            }
            .shake-wrapper {
              animation: shake 0.5s ease-in-out;
            }
          `}
        </style>
        <style>{`
          button[data-dialog-close] {
            display: none !important;
          }
        `}</style>

        <div className={`flex flex-col flex-1 min-h-0 ${isShaking ? 'shake-wrapper' : ''}`}>
          <div className={modal.headerClass} />

          {/* The scroller reaches into the dialog's right padding with matching padding inside, so its
              scrollbar runs in its own lane beside the content instead of over it. */}
          <div ref={scrollRef} className={`${modal.scrollClass} -mr-4 pr-4 [scrollbar-gutter:stable] [scrollbar-width:thin]`}>
            {reconnect
              ? <AstridSetupStep reconnect onNext={onClose} onClose={onClose} />
              : <CurrentStepComponent onNext={handleNext} onClose={onClose} />}
            <div className="h-6" />
          </div>

          {!reconnect && (
          <div className={`${modal.footerClass} relative`}>
            {showFade && currentStep !== 1 && (
              <div
                className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
                style={{ transform: 'translateY(-64px)' }}
              >
                <div className="h-full bg-gradient-to-t from-card via-card/95 to-transparent" />
              </div>
            )}

            {/* While setting up, what it's waiting for sits here, below the instructions rather than over them. */}
            {/* The checks sit centred in the footer, with no step-dot row beneath them. */}
            {currentStep === 1 && (
              <div className="border-t pt-6">
                <SetupFooterStatus />
                {wantsSetupSkip() && (
                  <div className="flex justify-center pt-3">
                    <button
                      type="button"
                      onClick={handleNext}
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      Skip setup
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className={`relative flex justify-center gap-x-2 pb-2 relative z-20 ${currentStep === 1 ? 'hidden' : 'pt-6 border-t'}`}>
              {currentStep > 1 && (
                <button
                  onClick={handleBack}
                  className="absolute left-0 top-1/2 -translate-y-1/4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex items-center gap-x-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Back</span>
                </button>
              )}

              {/* On the setup step the checks show progress; step dots there would only compete with them. */}
              <div className={`flex gap-x-2 ${currentStep === 1 ? 'hidden' : ''}`}>
                {stepTitles.map((_, index) => (
                  <div
                    key={index}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      currentStep === index + 1 ? 'bg-primary' : 'bg-muted'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
