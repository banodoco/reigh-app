import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWaveformData } from './useWaveformData';

type MockAudioBuffer = AudioBuffer;

function createMockAudioBuffer(samples: Float32Array, sampleRate = 4): MockAudioBuffer {
  return {
    duration: samples.length / sampleRate,
    length: samples.length,
    numberOfChannels: 1,
    sampleRate,
    getChannelData: () => samples,
  } as unknown as MockAudioBuffer;
}

class MockOfflineAudioContext {
  static decodedBuffer: MockAudioBuffer = createMockAudioBuffer(new Float32Array([0, 0, 0, 0]));

  async decodeAudioData() {
    return MockOfflineAudioContext.decodedBuffer;
  }
}

describe('useWaveformData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns null immediately when src is undefined', () => {
    const { result } = renderHook(() => useWaveformData(undefined, { numBuckets: 8 }));

    expect(result.current).toEqual({ waveform: null, loading: false });
  });

  it('returns null when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('missing', { status: 404 })));

    const { result } = renderHook(() => useWaveformData('https://example.com/fail.wav', { numBuckets: 8 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.waveform).toBeNull();
  });

  it('returns null when decodeAudioData rejects', async () => {
    class RejectingOfflineAudioContext extends MockOfflineAudioContext {
      override async decodeAudioData() {
        throw new Error('no audio stream');
      }
    }

    vi.stubGlobal('OfflineAudioContext', RejectingOfflineAudioContext);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })));

    const { result } = renderHook(() => useWaveformData('https://example.com/no-audio.mp4', { numBuckets: 8 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.waveform).toBeNull();
  });

  it('returns null when the decoded buffer is empty', async () => {
    MockOfflineAudioContext.decodedBuffer = createMockAudioBuffer(new Float32Array([]));
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 })));

    const { result } = renderHook(() => useWaveformData('https://example.com/empty.wav', { numBuckets: 8 }));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.waveform).toBeNull();
  });

  it('downsamples the trimmed audible region, normalizes to peak, and caches by src', async () => {
    MockOfflineAudioContext.decodedBuffer = createMockAudioBuffer(new Float32Array([
      0,
      0,
      0.25,
      0.25,
      0.5,
      0.5,
      1,
      1,
    ]));
    const fetchMock = vi.fn(async () => new Response(new ArrayBuffer(8), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const firstHook = renderHook(() => useWaveformData('https://example.com/audio.wav', {
      from: 1,
      to: 4,
      speed: 2,
      numBuckets: 1,
    }));
    const secondHook = renderHook(() => useWaveformData('https://example.com/audio.wav', {
      from: 1,
      to: 4,
      speed: 2,
      numBuckets: 1,
    }));

    await waitFor(() => {
      expect(firstHook.result.current.loading).toBe(false);
      expect(secondHook.result.current.loading).toBe(false);
    });

    expect(firstHook.result.current.waveform).toEqual([0.5, 1]);
    expect(secondHook.result.current.waveform).toEqual([0.5, 1]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
