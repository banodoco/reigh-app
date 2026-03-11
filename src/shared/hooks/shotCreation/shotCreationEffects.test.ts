import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inheritSettingsForNewShot: vi.fn(),
  dispatchAppEvent: vi.fn(),
}));

vi.mock('@/shared/lib/shotSettingsInheritance', () => ({
  inheritSettingsForNewShot: (...args: unknown[]) => mocks.inheritSettingsForNewShot(...args),
}));

vi.mock('@/shared/lib/typedEvents', () => ({
  dispatchAppEvent: (...args: unknown[]) => mocks.dispatchAppEvent(...args),
}));

import {
  applyShotCreationPostEffects,
  clearShotSkeletonEvent,
  dispatchShotSkeletonEvent,
} from './shotCreationEffects';

describe('shotCreationEffects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches the pending-create lifecycle events', () => {
    dispatchShotSkeletonEvent(3);
    clearShotSkeletonEvent();

    expect(mocks.dispatchAppEvent).toHaveBeenNthCalledWith(1, 'shot-pending-create', { imageCount: 3 });
    expect(mocks.dispatchAppEvent).toHaveBeenNthCalledWith(2, 'shot-pending-create-clear');
  });

  it('applies post-creation side effects and inherits settings when enabled', () => {
    const setLastAffectedShotId = vi.fn();
    const setLastCreatedShot = vi.fn();

    applyShotCreationPostEffects({
      result: { shotId: 'shot-2', shotName: 'Shot 2' },
      options: { inheritSettings: true, updateLastAffected: true },
      selectedProjectId: 'project-1',
      shots: [{ id: 'shot-1', name: 'Shot 1' }] as never,
      setLastAffectedShotId,
      setLastCreatedShot,
    });

    expect(setLastAffectedShotId).toHaveBeenCalledWith('shot-2');
    expect(mocks.inheritSettingsForNewShot).toHaveBeenCalledWith({
      newShotId: 'shot-2',
      projectId: 'project-1',
      shots: [{ id: 'shot-1', name: 'Shot 1' }],
    });
    expect(setLastCreatedShot).toHaveBeenCalledWith({ id: 'shot-2', name: 'Shot 2' });
  });
});
