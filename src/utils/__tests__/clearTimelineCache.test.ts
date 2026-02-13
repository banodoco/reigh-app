import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clearTimelineCache } from '../clearTimelineCache';

describe('clearTimelineCache', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('removes all timelineFramePositions_ keys from localStorage', () => {
    localStorage.setItem('timelineFramePositions_shot1', 'data1');
    localStorage.setItem('timelineFramePositions_shot2', 'data2');
    localStorage.setItem('otherKey', 'keep');

    const removed = clearTimelineCache();

    expect(removed).toBe(2);
    expect(localStorage.getItem('timelineFramePositions_shot1')).toBeNull();
    expect(localStorage.getItem('timelineFramePositions_shot2')).toBeNull();
    expect(localStorage.getItem('otherKey')).toBe('keep');
  });

  it('sets timeline_cache_cleared flag', () => {
    const removed = clearTimelineCache();

    expect(removed).toBe(0);
    expect(localStorage.getItem('timeline_cache_cleared')).toBe('true');
  });

  it('dispatches timeline-cache-cleared event when keys are removed', () => {
    localStorage.setItem('timelineFramePositions_shot1', 'data');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    clearTimelineCache();

    expect(dispatchSpy).toHaveBeenCalledOnce();
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('timeline-cache-cleared');
  });

  it('dispatches event on first run even without timeline keys', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    clearTimelineCache();

    expect(dispatchSpy).toHaveBeenCalledOnce();
  });

  it('does not dispatch event when already cleared and no keys removed', () => {
    localStorage.setItem('timeline_cache_cleared', 'true');
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    clearTimelineCache();

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('returns 0 on error', () => {
    // Force an error by making localStorage.length throw
    vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
      throw new Error('Storage error');
    });

    const removed = clearTimelineCache();
    expect(removed).toBe(0);
  });

  it('returns the count of removed keys', () => {
    localStorage.setItem('timelineFramePositions_a', '1');
    localStorage.setItem('timelineFramePositions_b', '2');
    localStorage.setItem('timelineFramePositions_c', '3');

    const removed = clearTimelineCache();
    expect(removed).toBe(3);
  });
});
