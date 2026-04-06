import { useEffect, useState } from 'react';

type WaveformOptions = {
  from?: number;
  to?: number;
  speed?: number;
  numBuckets: number;
};

type WaveformState = {
  waveform: number[] | null;
  loading: boolean;
};

const DECODER_SAMPLE_RATE = 44_100;
const MIN_BUCKETS = 2;
const MAX_CACHE_ENTRIES = 64;
const decodedBufferCache = new Map<string, Promise<AudioBuffer>>();

const evictOldest = () => {
  if (decodedBufferCache.size <= MAX_CACHE_ENTRIES) return;
  // Map iterates in insertion order — first key is oldest
  const oldest = decodedBufferCache.keys().next().value;
  if (oldest !== undefined) decodedBufferCache.delete(oldest);
};

const getDecodedBuffer = (src: string): Promise<AudioBuffer> => {
  if (!decodedBufferCache.has(src)) {
    evictOldest();
    decodedBufferCache.set(src, (async () => {
      const DecoderContext = globalThis.OfflineAudioContext;
      if (typeof DecoderContext === 'undefined') {
        throw new Error('OfflineAudioContext is unavailable');
      }

      const decoder = new DecoderContext(1, 1, DECODER_SAMPLE_RATE);
      const response = await fetch(src);
      if (!response.ok) {
        throw new Error(`Failed to fetch audio source: ${response.status}`);
      }

      return decoder.decodeAudioData((await response.arrayBuffer()).slice(0));
    })().catch((error) => {
      decodedBufferCache.delete(src);
      throw error;
    }));
  }

  return decodedBufferCache.get(src)!;
};

const buildWaveform = (buffer: AudioBuffer, options: WaveformOptions): number[] | null => {
  if (buffer.length <= 0 || buffer.numberOfChannels <= 0) {
    return null;
  }

  const bucketCount = Math.max(MIN_BUCKETS, Math.floor(options.numBuckets));
  const speed = options.speed && options.speed > 0 ? options.speed : 1;
  const clipFrom = Math.min(Math.max(options.from ?? 0, 0), buffer.duration);
  const clipTo = Math.min(typeof options.to === 'number' ? Math.max(options.to, clipFrom) : buffer.duration, buffer.duration);
  const sourceDuration = Math.max(0, clipTo - clipFrom);
  const audibleDuration = sourceDuration / speed;
  if (audibleDuration <= 0) {
    return null;
  }

  const startSample = Math.min(buffer.length, Math.floor(clipFrom * buffer.sampleRate));
  const endSample = Math.min(
    buffer.length,
    Math.ceil((clipFrom + audibleDuration * speed) * buffer.sampleRate),
  );
  if (endSample <= startSample) {
    return null;
  }

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index));
  const samplesPerBucket = (endSample - startSample) / bucketCount;
  const values = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = Math.min(endSample, Math.floor(startSample + index * samplesPerBucket));
    const bucketEnd = index === bucketCount - 1
      ? endSample
      : Math.min(endSample, Math.floor(startSample + (index + 1) * samplesPerBucket));
    if (bucketEnd <= bucketStart) {
      return 0;
    }

    let sumSquares = 0;
    let sampleCount = 0;
    for (const channel of channels) {
      for (let sampleIndex = bucketStart; sampleIndex < bucketEnd; sampleIndex += 1) {
        const sample = channel[sampleIndex] ?? 0;
        sumSquares += sample * sample;
        sampleCount += 1;
      }
    }

    return Math.sqrt(sumSquares / Math.max(sampleCount, 1));
  });

  const peak = Math.max(...values);
  return peak > 0 ? values.map((value) => value / peak) : values.map(() => 0);
};

export function useWaveformData(src: string | undefined, options: WaveformOptions): WaveformState {
  const [state, setState] = useState<WaveformState>(() => ({ waveform: null, loading: false }));
  const { from, to, speed, numBuckets } = options;
  const bucketCount = Math.max(MIN_BUCKETS, Math.floor(numBuckets));

  useEffect(() => {
    const controller = new AbortController();

    if (!src) {
      setState({ waveform: null, loading: false });
      return () => controller.abort();
    }

    setState({ waveform: null, loading: true });

    getDecodedBuffer(src)
      .then((buffer) => {
        if (!controller.signal.aborted) {
          setState({
            waveform: buildWaveform(buffer, { from, to, speed, numBuckets: bucketCount }),
            loading: false,
          });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({ waveform: null, loading: false });
        }
      });

    return () => controller.abort();
  }, [bucketCount, from, speed, to, src]);

  return state;
}
