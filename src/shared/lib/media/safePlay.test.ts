import { beforeEach, describe, expect, it, vi } from 'vitest';
import { safePlay } from './safePlay';

const reportRecoverableErrorMock = vi.fn();

vi.mock('@/shared/lib/errorHandling/recoverableError', () => ({
  reportRecoverableError: (...args: unknown[]) => reportRecoverableErrorMock(...args),
}));

describe('safePlay', () => {
  beforeEach(() => {
    reportRecoverableErrorMock.mockReset();
  });

  it('returns success when video.play resolves', async () => {
    const video = { play: vi.fn().mockResolvedValue(undefined) } as unknown as HTMLVideoElement;
    const result = await safePlay(video, 'safePlay.test.success');

    expect(video.play).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(reportRecoverableErrorMock).not.toHaveBeenCalled();
  });

  it('returns structured failure and reports recoverable error when play rejects', async () => {
    const playbackError = new Error('blocked by autoplay');
    const video = { play: vi.fn().mockRejectedValue(playbackError) } as unknown as HTMLVideoElement;
    const result = await safePlay(video, 'safePlay.test.failure', { videoId: 'video-1' });

    expect(video.play).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('video_playback_failed');
      expect(result.recoverable).toBe(true);
      expect(result.message).toBe('Video playback could not start.');
      expect(result.cause).toEqual({
        context: 'safePlay.test.failure',
        logData: { videoId: 'video-1' },
      });
    }
    expect(reportRecoverableErrorMock).toHaveBeenCalledWith(
      playbackError,
      {
        context: 'safePlay.test.failure',
        logData: { videoId: 'video-1' },
      },
    );
  });
});
