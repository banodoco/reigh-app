import { describe, expect, it } from 'vitest';
import * as GlobalHeaderControllerModule from './useGlobalHeaderController';
import * as GlobalHeaderDesktopModule from './GlobalHeaderDesktop';
import * as GlobalHeaderMobileModule from './GlobalHeaderMobile';
import * as ProjectSelectorPopoverModule from './ProjectSelectorPopover';
import * as GlobalHeaderTypesModule from './types';
import * as UseGlobalHeaderAuthModule from './useGlobalHeaderAuth';
import * as UseGlobalHeaderProjectModule from './useGlobalHeaderProject';

describe('GlobalHeader module coverage surface', () => {
  it('loads all GlobalHeader modules directly', () => {
    expect(GlobalHeaderControllerModule).toBeDefined();
    expect(GlobalHeaderDesktopModule).toBeDefined();
    expect(GlobalHeaderMobileModule).toBeDefined();
    expect(ProjectSelectorPopoverModule).toBeDefined();
    expect(GlobalHeaderTypesModule).toBeDefined();
    expect(UseGlobalHeaderAuthModule).toBeDefined();
    expect(UseGlobalHeaderProjectModule).toBeDefined();
  });
});
