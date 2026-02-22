import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import VideoShotDisplay from '../VideoShotDisplay';

describe('VideoShotDisplay', () => {
  it('exports expected members', () => {
    expect(VideoShotDisplay).toBeDefined();
    expect(typeof VideoShotDisplay).toBe('function');
  });
});
