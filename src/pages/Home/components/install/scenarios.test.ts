import { describe, expect, it } from 'vitest';
import { resolveInstallScenarioPresentation } from './scenarios';
import { installVisuals } from './visuals';

describe('resolveInstallScenarioPresentation', () => {
  it('uses installed title and mobile-home icon for installed mobile devices', () => {
    const result = resolveInstallScenarioPresentation({
      installMethod: 'none',
      platform: 'ios',
      browser: 'safari',
      deviceType: 'phone',
      isAppInstalled: true,
    });

    expect(result.title).toBe('Reigh is already installed!');
    expect(result.Visual).toBe(installVisuals.mobileHomeIcon);
  });

  it('resolves safari-dock install flow for mac safari', () => {
    const result = resolveInstallScenarioPresentation({
      installMethod: 'safari-dock',
      platform: 'mac',
      browser: 'safari',
      deviceType: 'desktop',
      isAppInstalled: false,
    });

    expect(result.title).toBe('Add Reigh to your dock');
    expect(result.Visual).toBe(installVisuals.safariFileMenu);
  });

  it('resolves chromium install visual for desktop chrome', () => {
    const result = resolveInstallScenarioPresentation({
      installMethod: 'prompt',
      platform: 'windows',
      browser: 'chrome',
      deviceType: 'desktop',
      isAppInstalled: false,
    });

    expect(result.title).toBe('Install Reigh');
    expect(result.Visual).toBe(installVisuals.chromeInstall);
  });

  it('returns null visual when no matching install visual rule exists', () => {
    const result = resolveInstallScenarioPresentation({
      installMethod: 'none',
      platform: 'linux',
      browser: 'firefox',
      deviceType: 'desktop',
      isAppInstalled: false,
    });

    expect(result.title).toBe('Install Reigh');
    expect(result.Visual).toBeNull();
  });
});
