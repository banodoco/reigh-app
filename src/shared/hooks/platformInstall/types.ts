export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface NavigatorWithExtensions extends Navigator {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<Array<{ platform: string; url?: string; id?: string }>>;
  connection?: { effectiveType?: string };
}

export type Platform = 'mac' | 'windows' | 'linux' | 'ios' | 'android' | 'unknown';
export type Browser = 'chrome' | 'safari' | 'edge' | 'firefox' | 'samsung' | 'unknown';
export type InstallMethod = 'prompt' | 'safari-dock' | 'safari-home-screen' | 'none';
export type DeviceType = 'phone' | 'tablet' | 'desktop';

export interface PlatformInstallState {
  platform: Platform;
  browser: Browser;
  deviceType: DeviceType;
  isStandalone: boolean;
  canInstall: boolean;
  isWaitingForPrompt: boolean;
  isAppInstalled: boolean;
  installMethod: InstallMethod;
  ctaText: string;
  ctaIcon: 'download' | 'plus' | 'discord' | 'external';
  showInstallCTA: boolean;
  installInstructions: string[];
  triggerInstall: () => Promise<boolean>;
}

export interface InstallPromptSignals {
  deferredPrompt: BeforeInstallPromptEvent | null;
  promptTimedOut: boolean;
  isAppInstalled: boolean;
  promptConsumed: boolean;
  setDeferredPrompt: (value: BeforeInstallPromptEvent | null) => void;
  setPromptConsumed: (value: boolean) => void;
}

export interface InstallMethodContext {
  isStandalone: boolean;
  deferredPrompt: BeforeInstallPromptEvent | null;
  platform: Platform;
  browser: Browser;
  safariSupportsPWA: boolean;
  isDesktopChromium: boolean;
}

export interface InstallInstructionContext {
  installMethod: InstallMethod;
  browser: Browser;
  platform: Platform;
  deviceType: DeviceType;
  isWaitingForPrompt: boolean;
  isAppInstalled: boolean;
  promptTimedOut: boolean;
  isDesktopChromium: boolean;
}
