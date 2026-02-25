import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import type { InstallMethod, Platform, Browser, DeviceType } from '@/shared/hooks/usePlatformInstall';
import type { OpenStateContract } from '@/shared/components/dialogs/contracts';
import { resolveInstallScenarioPresentation } from './scenarios';

interface InstallInstructionsModalProps extends OpenStateContract {
  installMethod: InstallMethod;
  platform: Platform;
  browser: Browser;
  deviceType: DeviceType;
  instructions: string[];
  isAppInstalled?: boolean;
  isSignedIn?: boolean;
  onFallbackToDiscord: () => void;
}

export const InstallInstructionsModal: React.FC<InstallInstructionsModalProps> = ({
  open,
  onOpenChange,
  installMethod,
  platform,
  browser,
  deviceType,
  instructions,
  isAppInstalled,
  isSignedIn,
  onFallbackToDiscord,
}) => {
  const { title, Visual } = resolveInstallScenarioPresentation({
    installMethod,
    platform,
    browser,
    deviceType,
    isAppInstalled,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border gap-3">
        <DialogHeader className="text-center">
          <DialogTitle className="text-xl font-theme font-theme-heading text-center">
            {title}
          </DialogTitle>
        </DialogHeader>

        {instructions.length > 0 && (
          <div className="text-center">
            {instructions.map((instruction, index) => (
              <p key={index} className="text-sm text-muted-foreground">
                {instruction}
              </p>
            ))}
          </div>
        )}

        {Visual && (
          <div className="flex justify-center">
            <Visual />
          </div>
        )}

        <div className="flex justify-center pt-1">
          <button
            onClick={() => {
              onOpenChange(false);
              onFallbackToDiscord();
            }}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors focus:outline-none"
          >
            {isSignedIn ? 'or continue in browser' : isAppInstalled ? 'continue in browser instead' : 'or sign in here instead'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
