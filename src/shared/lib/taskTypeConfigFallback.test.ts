import { describe, it, expect } from 'vitest';
import {
  TASK_TYPE_CONFIG_FALLBACK_VERSION,
  getTaskTypeConfigFallback,
  getTaskTypeFallbackEntries,
  getTaskTypeFamilyFromFallback,
} from './taskTypeConfigFallback';

describe('taskTypeConfigFallback', () => {
  it('returns fallback entry for known task type', () => {
    const entry = getTaskTypeConfigFallback('travel_orchestrator');

    expect(TASK_TYPE_CONFIG_FALLBACK_VERSION).toBeGreaterThan(0);
    expect(entry).toEqual(
      expect.objectContaining({
        isVisible: true,
        displayName: 'Travel Between Images',
        family: 'travel',
      }),
    );
  });

  it('returns fallback entries list and family helpers', () => {
    const entries = getTaskTypeFallbackEntries();
    const keys = entries.map(([key]) => key);

    expect(keys).toContain('qwen_image');
    expect(getTaskTypeFamilyFromFallback('join_clips_orchestrator')).toBe('join_clips');
    expect(getTaskTypeFamilyFromFallback('unknown_task')).toBeUndefined();
  });
});
