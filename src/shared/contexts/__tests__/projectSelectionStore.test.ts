// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getProjectSelectionFallbackId,
  initializeProjectSelectionStore,
  resetProjectSelectionStoreForTests,
  setProjectSelectionSnapshot,
} from '../projectSelectionStore';

describe('projectSelectionStore', () => {
  beforeEach(() => {
    resetProjectSelectionStoreForTests();
    vi.restoreAllMocks();
  });

  it('seeds the runtime snapshot from persisted storage during initialization', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('proj-from-storage');

    initializeProjectSelectionStore();

    expect(getProjectSelectionFallbackId()).toBe('proj-from-storage');
  });

  it('does not fall back to stale storage after runtime selection changes', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('proj-from-storage');

    initializeProjectSelectionStore();
    setProjectSelectionSnapshot({ selectedProjectId: null });

    expect(getProjectSelectionFallbackId()).toBeNull();
  });
});
