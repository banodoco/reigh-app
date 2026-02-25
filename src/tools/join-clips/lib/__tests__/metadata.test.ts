import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClipsNeedingDuration, loadClipDuration } from '../clipManager/metadata';

const mockExtractVideoMetadataFromUrl = vi.fn();
const mockHandleError = vi.fn();

vi.mock('@/shared/lib/videoUploader', () => ({
  extractVideoMetadataFromUrl: (...args: unknown[]) => mockExtractVideoMetadataFromUrl(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockHandleError(...args),
}));

describe('join clips metadata boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters to clips that still need metadata loading', () => {
    const clips = [
      { id: 'a', url: 'a.mp4', loaded: false, playing: false },
      { id: 'b', url: 'b.mp4', durationSeconds: 4, loaded: false, playing: false },
      { id: 'c', url: 'c.mp4', metadataLoading: true, loaded: false, playing: false },
      { id: 'e', url: 'e.mp4', durationLoadFailed: true, loaded: false, playing: false },
      { id: 'd', url: '', loaded: false, playing: false },
    ];
    const result = getClipsNeedingDuration(clips);
    expect(result.map((clip) => clip.id)).toEqual(['a']);
  });

  it('returns extracted duration when metadata probe succeeds', async () => {
    mockExtractVideoMetadataFromUrl.mockResolvedValue({ duration_seconds: 9.5 });
    const result = await loadClipDuration({
      id: 'clip-1',
      url: 'https://example.com/clip.mp4',
      loaded: false,
      playing: false,
    });
    expect(result).toEqual({
      ok: true,
      value: { id: 'clip-1', durationSeconds: 9.5 },
      policy: 'best_effort',
      recoverable: false,
    });
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('returns a structured failure and logs through normalizeAndPresentError on failure', async () => {
    const probeError = new Error('metadata read failed');
    mockExtractVideoMetadataFromUrl.mockRejectedValue(probeError);

    const result = await loadClipDuration({
      id: 'clip-2',
      url: 'https://example.com/broken.mp4',
      loaded: false,
      playing: false,
    });

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'clip_metadata_load_failed',
      recoverable: true,
      policy: 'degrade',
    });
    expect(mockHandleError).toHaveBeenCalledWith(probeError, {
      context: 'JoinClipsPage',
      showToast: false,
      logData: { clipId: 'clip-2' },
    });
  });
});
