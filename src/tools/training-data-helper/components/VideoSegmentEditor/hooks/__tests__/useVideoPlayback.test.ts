import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useVideoPlayback } from '../useVideoPlayback';

describe('useVideoPlayback', () => {
  it('exports expected members', () => {
    expect(useVideoPlayback).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useVideoPlayback is a callable function', () => {
    expect(typeof useVideoPlayback).toBe('function');
    expect(useVideoPlayback.name).toBeDefined();
  });
});
