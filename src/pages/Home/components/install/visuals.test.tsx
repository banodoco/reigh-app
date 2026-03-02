import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { installVisuals } from './visuals';

describe('installVisuals', () => {
  it('exports expected visual keys', () => {
    expect(Object.keys(installVisuals).sort()).toEqual([
      'androidInstallPrompt',
      'chromeInstall',
      'chromeIosShare',
      'edgeAppAvailable',
      'edgeIosShare',
      'ipadChromeShare',
      'ipadEdgeShare',
      'ipadSafariShare',
      'mobileHomeIcon',
      'openInApp',
      'safariFileMenu',
      'safariShare',
    ]);
  });

  it('renders every visual component without crashing', () => {
    Object.values(installVisuals).forEach((Visual) => {
      const { container, unmount } = render(<Visual />);
      expect(container.firstChild).not.toBeNull();
      unmount();
    });
  });

  it('keeps all visuals as component factories', () => {
    Object.values(installVisuals).forEach((Visual) => {
      expect(typeof Visual).toBe('function');
    });
  });
});
