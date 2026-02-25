import type { InstallMethod, Platform, Browser, DeviceType } from '@/shared/hooks/usePlatformInstall';
import { installVisuals } from './visuals';

interface InstallScenarioInput {
  installMethod: InstallMethod;
  platform: Platform;
  browser: Browser;
  deviceType: DeviceType;
  isAppInstalled?: boolean;
}

function getInstallModalTitle({
  platform,
  browser,
  isAppInstalled,
}: Pick<InstallScenarioInput, 'platform' | 'browser' | 'isAppInstalled'>): string {
  if (isAppInstalled) {
    return 'Reigh is already installed!';
  }
  if (platform === 'ios') {
    return 'Add Reigh to home screen';
  }
  if (platform === 'mac' && browser === 'safari') {
    return 'Add Reigh to your dock';
  }
  return 'Install Reigh';
}

type InstallVisual = (typeof installVisuals)[keyof typeof installVisuals];

interface InstallVisualRule {
  matches: (input: InstallScenarioInput) => boolean;
  Visual: InstallVisual;
}

const installVisualRules: InstallVisualRule[] = [
  {
    matches: ({ isAppInstalled, deviceType }) => Boolean(isAppInstalled && (deviceType === 'phone' || deviceType === 'tablet')),
    Visual: installVisuals.mobileHomeIcon,
  },
  {
    matches: ({ isAppInstalled }) => Boolean(isAppInstalled),
    Visual: installVisuals.openInApp,
  },
  {
    matches: ({ installMethod }) => installMethod === 'safari-dock',
    Visual: installVisuals.safariFileMenu,
  },
  {
    matches: ({ installMethod, deviceType, browser }) => (
      installMethod === 'safari-home-screen'
      && deviceType === 'tablet'
      && browser === 'chrome'
    ),
    Visual: installVisuals.ipadChromeShare,
  },
  {
    matches: ({ installMethod, deviceType, browser }) => (
      installMethod === 'safari-home-screen'
      && deviceType === 'tablet'
      && browser === 'edge'
    ),
    Visual: installVisuals.ipadEdgeShare,
  },
  {
    matches: ({ installMethod, deviceType }) => (
      installMethod === 'safari-home-screen'
      && deviceType === 'tablet'
    ),
    Visual: installVisuals.ipadSafariShare,
  },
  {
    matches: ({ installMethod, browser }) => (
      installMethod === 'safari-home-screen'
      && browser === 'chrome'
    ),
    Visual: installVisuals.chromeIosShare,
  },
  {
    matches: ({ installMethod, browser }) => (
      installMethod === 'safari-home-screen'
      && browser === 'edge'
    ),
    Visual: installVisuals.edgeIosShare,
  },
  {
    matches: ({ installMethod }) => installMethod === 'safari-home-screen',
    Visual: installVisuals.safariShare,
  },
  {
    matches: ({ platform }) => platform === 'android',
    Visual: installVisuals.androidInstallPrompt,
  },
  {
    matches: ({ browser }) => browser === 'chrome',
    Visual: installVisuals.chromeInstall,
  },
  {
    matches: ({ browser }) => browser === 'edge',
    Visual: installVisuals.edgeAppAvailable,
  },
];

function resolveInstallVisual(input: InstallScenarioInput): InstallVisual | null {
  for (const rule of installVisualRules) {
    if (rule.matches(input)) {
      return rule.Visual;
    }
  }
  return null;
}

interface InstallScenarioPresentation {
  title: string;
  Visual: InstallVisual | null;
}

export function resolveInstallScenarioPresentation(
  input: InstallScenarioInput,
): InstallScenarioPresentation {
  const title = getInstallModalTitle(input);
  const Visual = resolveInstallVisual(input);
  return {
    title,
    Visual,
  };
}
