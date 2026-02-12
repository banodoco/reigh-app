import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ChevronRight, ChevronLeft, Palette, Users, Monitor, Settings, Loader2, MoreHorizontal, Sun, Moon, Globe } from 'lucide-react';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { PrivacyToggle } from '@/shared/components/ui/privacy-toggle';

import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useDarkMode } from '@/shared/hooks/useDarkMode';
import { useMediumModal } from '@/shared/hooks/useModal';
import { useScrollFade } from '@/shared/hooks/useScrollFade';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Color sequence for step icons — uses semantic tokens for theme consistency
const getStepColors = (stepIndex: number) => {
  const colors = [
    { bg: 'bg-accent', icon: 'text-primary' },             // Step 1
    { bg: 'bg-secondary', icon: 'text-secondary-foreground' }, // Step 2
    { bg: 'bg-muted', icon: 'text-foreground' },            // Step 3
    { bg: 'bg-accent', icon: 'text-primary' },              // Step 4
    { bg: 'bg-secondary', icon: 'text-secondary-foreground' }, // Step 5
    { bg: 'bg-muted', icon: 'text-foreground' },            // Step 6
    { bg: 'bg-accent', icon: 'text-primary' },              // Step 7
  ];

  return colors[(stepIndex - 1) % colors.length];
};

// Step 1: Introduction to Reigh
const IntroductionStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const colors = getStepColors(1);
  return (
  <>
    <DialogHeader className="text-center space-y-4 mb-6">
      <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
        <Palette className={`w-8 h-8 ${colors.icon}`} />
      </div>
      <DialogTitle className="text-2xl font-bold text-center">
        Welcome to Reigh!
      </DialogTitle>
    </DialogHeader>
    
    <div className="text-center space-y-4">
      <p className="text-muted-foreground">
        We believe that combining image anchoring with additional control mechanisms can allow artists to steer AI video with unparalleled precision and ease.
      </p>
      <p className="text-muted-foreground">
        Reigh aims to provide you with the best techniques in the open source AI art ecosystem for both generating anchor images, and travelling between them. We want to make the struggle of creating art that feels truly your own as easy as possible.
      </p>
    </div>
    
    <div className="flex justify-center pt-5 pb-2">
      <Button variant="retro" size="retro-sm" onClick={onNext} className="w-full sm:w-auto">
        Let's get started
        <ChevronRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  </>
);
};

// Step 2: Community
const CommunityStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const colors = getStepColors(2);
  return (
  <>
    <DialogHeader className="text-center space-y-4 mb-6">
      <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
        <Users className={`w-8 h-8 ${colors.icon}`} />
      </div>
      <DialogTitle className="text-2xl font-bold text-center">
        Join Our Community
      </DialogTitle>
    </DialogHeader>
    
    <div className="text-center space-y-4">
      <p className="text-muted-foreground">
        If you want to get good at creating art, the hardest part is not giving up.
      </p>
      <p className="text-muted-foreground">
        Our community will grow to become a place where artists can learn from, support, and inspire each other.
      </p>
    </div>
    
    <div className="flex flex-col gap-y-2 pt-5 pb-2">
      <Button 
        variant="retro"
        size="retro-sm"
        onClick={() => window.open('https://discord.gg/D5K2c6kfhy', '_blank')}
        className="w-full"
      >
        <Users className="w-4 h-4 mr-2" />
        Join Discord Community
      </Button>
      <Button variant="retro-secondary" size="retro-sm" onClick={onNext} className="w-full">
        Continue Setup
      </Button>
    </div>
  </>
);
};

// Step 3: Generation Method Selection (Lazy-loaded to improve modal performance)
const GenerationMethodStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  // Use database-backed generation preferences (same as SettingsModal)
  // Only loads when this step is actually rendered, improving initial modal performance
  const { 
    value: generationMethods, 
    update: updateGenerationMethods,
    isLoading: isLoadingGenerationMethods
  } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  
  const colors = getStepColors(3);
  
  const onComputerChecked = generationMethods.onComputer;
  const inCloudChecked = generationMethods.inCloud;

  // Show skeleton loading state while preferences are being fetched
  if (isLoadingGenerationMethods) {
    return (
      <>
        <DialogHeader className="text-center space-y-4 mb-6">
          <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
            <Monitor className={`w-8 h-8 ${colors.icon}`} />
          </div>
          <DialogTitle className="text-2xl font-bold text-center">
            How would you like to generate?
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Skeleton for description text */}
          <div className="text-center">
            <div className="h-4 bg-muted rounded animate-pulse mx-auto w-80"></div>
            <div className="h-4 bg-muted rounded animate-pulse mx-auto w-48 mt-1"></div>
          </div>

          {/* Skeleton for toggle switch - matches actual design */}
          <div className="flex justify-center px-4">
            <div className="relative inline-flex items-center bg-muted rounded-full p-1 shadow-inner min-w-fit">
              <div className="flex">
                {/* In the cloud button skeleton */}
                <div className="px-4 py-2 rounded-full bg-border animate-pulse">
                  <div className="h-4 w-24 bg-muted-foreground/30 rounded"></div>
                </div>
                {/* On my computer button skeleton */}
                <div className="px-4 py-2 rounded-full">
                  <div className="h-4 w-28 bg-border rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>

          {/* Skeleton for additional info section */}
          <div className="text-center space-y-3">
            <div className="p-4 bg-muted rounded-lg animate-pulse">
              <div className="h-4 bg-border rounded mx-auto w-64"></div>
            </div>
          </div>
        </div>

        {/* Skeleton for continue button */}
        <div className="flex justify-center pt-5 pb-2">
          <div className="w-full sm:w-auto h-10 bg-border rounded animate-pulse px-8"></div>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader className="text-center space-y-4 mb-6">
        <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
          <Monitor className={`w-8 h-8 ${colors.icon}`} />
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          How would you like to generate?
        </DialogTitle>
      </DialogHeader>
      
      <div className="space-y-6">
        <p className="text-center text-muted-foreground">
          If you have{' '}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="sparkle-underline cursor-pointer transition-colors duration-200">
                  a sufficiently powerful computer
                </span>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                align="center"
                className="flex items-center gap-2 text-left p-3 max-w-xs border-2 border-transparent bg-wes-cream/95 rounded-lg shadow-md transition-all duration-300 hover:bg-gradient-to-r hover:from-wes-pink/10 hover:via-wes-coral/10 hover:to-wes-vintage-gold/10 hover:border-transparent hover:bg-origin-border hover:shadow-2xl hover:-translate-y-1 z-[11100]"
                style={{ zIndex: 11100 }}
              >
                <p className="text-xs sm:text-sm leading-relaxed text-primary">
                  Things are optimized to run on a NVIDIA 4090 - 24GB VRAM GPU - but some models can work on computers with as little as 6GB of VRAM.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          , you can run Reigh <strong>for free</strong> - thanks to the work of{' '}
          <a 
            href="https://github.com/deepbeepmeep/Wan2GP" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:no-underline text-primary"
          >
            deepbeepmeep
          </a>. You can change this later in settings.
        </p>

        <div className="flex justify-center px-4">
          <SegmentedControl
            value={inCloudChecked && !onComputerChecked ? 'cloud' : onComputerChecked && !inCloudChecked ? 'local' : ''}
            onValueChange={(value) => {
              if (value === 'cloud') {
                updateGenerationMethods({ inCloud: true, onComputer: false });
              } else if (value === 'local') {
                updateGenerationMethods({ onComputer: true, inCloud: false });
              }
            }}
            variant="pill"
          >
            <SegmentedControlItem value="cloud" colorScheme="blue">
              In the cloud ☁️
            </SegmentedControlItem>
            <SegmentedControlItem value="local" colorScheme="emerald">
              On my computer 💻
            </SegmentedControlItem>
          </SegmentedControl>
        </div>

        {/* Additional info below toggle */}
        <div className="text-center space-y-3">
          {inCloudChecked && !onComputerChecked && (
            <div className="p-4 bg-secondary/50 rounded-lg">
              <p className="text-sm text-secondary-foreground font-light">
                ☁️ Easy setup, pay-per-use, works on any device
              </p>
            </div>
          )}

          {onComputerChecked && !inCloudChecked && (
            <div className="p-4 bg-accent rounded-lg">
              <p className="text-sm text-accent-foreground font-light flex items-center justify-center gap-2">
                <span>💻 Free to use, requires setup, need a good GPU</span>
                <span className="bg-primary text-primary-foreground text-xs font-light px-2 py-1 rounded-full">Free</span>
              </p>
            </div>
          )}
        </div>

        {!onComputerChecked && !inCloudChecked && (
          <div className="text-center">
            <img
              src="https://wczysqzxlwdndgxitrvc.supabase.co/storage/v1/object/public/image_uploads/files/ds.gif"
              alt="Choose generation method"
              className="w-[120px] h-[120px] object-contain transform scale-x-[-1] mx-auto"
            />
            <p className="text-sm text-muted-foreground mt-2">
              Select at least one option to continue
            </p>
          </div>
        )}
      </div>
      
      <div className="flex justify-center pt-5 pb-2">
        <Button 
          variant="retro"
          size="retro-sm"
          onClick={onNext} 
          disabled={!onComputerChecked && !inCloudChecked}
          className="w-full sm:w-auto"
        >
          Continue
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </>
  );
};

// Step 4: Theme Selection
const ThemeStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const colors = getStepColors(4);
  const { darkMode, setDarkMode } = useDarkMode();
  
  // Also persist to database for cross-device sync
  const { 
    update: updateThemePreference 
  } = useUserUIState('theme', { darkMode: true });

  const handleThemeChange = (isDark: boolean) => {
    setDarkMode(isDark);
    updateThemePreference({ darkMode: isDark });
  };

  return (
    <>
      <DialogHeader className="text-center space-y-4 mb-6">
        <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
          {darkMode ? (
            <Moon className={`w-8 h-8 ${colors.icon}`} />
          ) : (
            <Sun className={`w-8 h-8 ${colors.icon}`} />
          )}
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          Choose Your Theme
        </DialogTitle>
      </DialogHeader>
      
      <div className="space-y-6">
        <p className="text-center text-muted-foreground">
          Which mode do you prefer? You can always change this later in settings.
        </p>

        <div className="flex justify-center px-4">
          <SegmentedControl
            value={darkMode ? 'dark' : 'light'}
            onValueChange={(value) => handleThemeChange(value === 'dark')}
            variant="pill"
          >
            <SegmentedControlItem value="light" colorScheme="amber" icon={<Sun className="h-4 w-4" />}>
              Light
            </SegmentedControlItem>
            <SegmentedControlItem value="dark" colorScheme="violet" icon={<Moon className="h-4 w-4" />}>
              Dark
            </SegmentedControlItem>
          </SegmentedControl>
        </div>

      </div>
      
      <div className="flex justify-center pt-5 pb-2">
        <Button variant="retro" size="retro-sm" onClick={onNext} className="w-full sm:w-auto">
          Continue
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </>
  );
};

// Step 5: Privacy Defaults
const PrivacyDefaultsStep: React.FC<{ onNext: () => void }> = ({ onNext }) => {
  const colors = getStepColors(5);
  
  // Privacy defaults state using database-backed preferences
  const { 
    value: privacyDefaults, 
    update: updatePrivacyDefaults,
    isLoading: isLoadingPrivacyDefaults
  } = useUserUIState('privacyDefaults', { resourcesPublic: true, generationsPublic: false });

  if (isLoadingPrivacyDefaults) {
    return (
      <>
        <DialogHeader className="text-center space-y-4 mb-6">
          <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
            <Globe className={`w-8 h-8 ${colors.icon}`} />
          </div>
          <DialogTitle className="text-2xl font-bold text-center">
            Privacy Defaults
          </DialogTitle>
        </DialogHeader>
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader className="text-center space-y-4 mb-6">
        <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
          <Globe className={`w-8 h-8 ${colors.icon}`} />
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          Are you okay with your creations being public?
        </DialogTitle>
      </DialogHeader>
      
      <div className="space-y-4">
        {/* Side by side toggles */}
        <div className="grid grid-cols-2 gap-3">
          {/* Resources Toggle */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <span className="font-medium text-sm">Resources</span>
            <p className="text-xs text-muted-foreground leading-snug">
              This will allow others to use them. You can update this for individual resources.
            </p>
            <PrivacyToggle
              isPublic={privacyDefaults.resourcesPublic}
              onValueChange={(isPublic) => updatePrivacyDefaults({ resourcesPublic: isPublic })}
              size="sm"
            />
          </div>

          {/* Generations Toggle */}
          <div className="p-3 bg-muted/50 rounded-lg space-y-2">
            <span className="font-medium text-sm">Generations</span>
            <p className="text-xs text-muted-foreground leading-snug">
              This will allow others to view your generations, and train LoRAs on them.
            </p>
            <PrivacyToggle
              isPublic={privacyDefaults.generationsPublic}
              onValueChange={(isPublic) => updatePrivacyDefaults({ generationsPublic: isPublic })}
              size="sm"
            />
          </div>
        </div>
      </div>
      
      <div className="flex justify-center pt-5 pb-2">
        <Button variant="retro" size="retro-sm" onClick={onNext} className="w-full sm:w-auto">
          Continue
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </>
);
};

// Step 6: Setup Complete
const SetupCompleteStep: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const colors = getStepColors(6);
  
  const handleOpenSettings = () => {
    onClose();
    // Trigger settings modal to open - we'll need to communicate this back to the parent
    setTimeout(() => {
      // This is a bit hacky, but we can trigger a custom event or use a callback
      window.dispatchEvent(new CustomEvent('openSettings', { detail: { tab: 'generate-locally' } }));
    }, 100);
  };

  return (
    <>
      <DialogHeader className="text-center space-y-4 mb-6">
        <div className={`mx-auto w-16 h-16 ${colors.bg} rounded-full flex items-center justify-center`}>
        <MoreHorizontal className={`w-8 h-8 ${colors.icon}`} />
        </div>
        <DialogTitle className="text-2xl font-bold text-center">
          One more thing
        </DialogTitle>
      </DialogHeader>
      
      <div className="text-center space-y-4">
        <p className="text-muted-foreground">
          Reigh is an early-stage tool. If there's anything that isn't working for you or could be better, please drop into our Discord and leave a message in our #support channel or DM POM.
        </p>
        <p className="text-muted-foreground">
          There's no feedback too big or too small - so please share!
        </p>
      </div>
      
      <div className="flex flex-col gap-y-2 pt-5 pb-2">
        <Button variant="retro" size="retro-sm" onClick={handleOpenSettings} className="w-full">
          <Settings className="w-4 h-4 mr-2" />
          Open Settings to Get Set Up
        </Button>
        <Button variant="retro-secondary" size="retro-sm" onClick={onClose} className="w-full">
          Start Creating
        </Button>
      </div>
    </>
  );
};

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isShaking, setIsShaking] = useState(false);
  const shakeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modal = useMediumModal();
  const { showFade, scrollRef } = useScrollFade({
    isOpen,
    preloadFade: modal.isMobile
  });

  // Reset to step 1 when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1);
    }
  }, [isOpen]);

  // Cleanup shake timeout on unmount
  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) {
        clearTimeout(shakeTimeoutRef.current);
      }
    };
  }, []);

  const handleNext = () => {
    setCurrentStep(prev => Math.min(prev + 1, 6));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleShake = () => {
    setIsShaking(true);
    if (shakeTimeoutRef.current) {
      clearTimeout(shakeTimeoutRef.current);
    }
    shakeTimeoutRef.current = setTimeout(() => setIsShaking(false), 500);
  };

  // Render current step component conditionally to avoid calling hooks for unused steps
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 1:
        return <IntroductionStep onNext={handleNext} />;
      case 2:
        return <CommunityStep onNext={handleNext} />;
      case 3:
        return <GenerationMethodStep onNext={handleNext} />;
      case 4:
        return <ThemeStep onNext={handleNext} />;
      case 5:
        return <PrivacyDefaultsStep onNext={handleNext} />;
      case 6:
        return <SetupCompleteStep onClose={onClose} />;
      default:
        return <IntroductionStep onNext={handleNext} />;
    }
  };

  const stepTitles = ["Welcome", "Community", "Generation", "Theme", "Privacy", "Complete"];
  
  return (
    <Dialog open={isOpen} onOpenChange={handleShake}>
      <DialogContent 
        className={modal.className}
        style={modal.style}
      >
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
          /* Hide the built-in close button from Dialog component */
          button[data-dialog-close] {
            display: none !important;
          }
        `}</style>
        <div className={`flex flex-col flex-1 min-h-0 ${isShaking ? 'shake-wrapper' : ''}`}>
          <div className={modal.headerClass}></div>

        <div ref={scrollRef} className={modal.scrollClass}>
          {renderCurrentStep()}
          <div className="h-6"></div>
        </div>
        
        <div className={`${modal.footerClass} relative`}>
          {/* Fade overlay */}
          {showFade && (
            <div 
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-card via-card/95 to-transparent" />
            </div>
          )}

          {/* Step indicator and back button container */}
          <div className="relative flex justify-center gap-x-2 pt-6 pb-2 border-t relative z-20">
            {/* Back button - only show after step 1 */}
            {currentStep > 1 && (
              <button
                onClick={handleBack}
                className="absolute left-0 top-1/2 -translate-y-1/4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 flex items-center gap-x-1 text-sm text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                <span>Back</span>
              </button>
            )}
            
            {/* Step indicators */}
            <div className="flex gap-x-2">
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
        </div>
      </DialogContent>
    </Dialog>
  );
}; 