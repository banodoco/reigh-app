import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detachAudioFromVideo,
  isTrackMuted,
  setTrackVolume,
  toggleTrackMute,
} from '@/tools/video-editor/lib/editor-utils';
import type { ResolvedTimelineClip, ResolvedTimelineConfig, TrackDefinition } from '@/tools/video-editor/types';

const makeTrack = (overrides: Partial<TrackDefinition> = {}): TrackDefinition => ({
  id: 'V1',
  kind: 'visual',
  label: 'V1',
  ...overrides,
});

const makeVideoClip = (overrides: Partial<ResolvedTimelineClip> = {}): ResolvedTimelineClip => ({
  id: 'clip-1',
  at: 3,
  track: 'V1',
  clipType: 'media',
  asset: 'asset-video',
  assetEntry: {
    file: 'video.mp4',
    src: 'https://example.com/video.mp4',
    type: 'video/mp4',
    duration: 12,
  },
  from: 1,
  to: 5,
  speed: 1.25,
  volume: 0.8,
  ...overrides,
});

const makeConfig = (overrides: Partial<ResolvedTimelineConfig> = {}): ResolvedTimelineConfig => ({
  output: {
    resolution: '1920x1080',
    fps: 30,
    file: 'out.mp4',
  },
  tracks: [
    makeTrack(),
    makeTrack({ id: 'A1', kind: 'audio', label: 'A1' }),
  ],
  clips: [makeVideoClip()],
  registry: {
    'asset-video': {
      file: 'video.mp4',
      src: 'https://example.com/video.mp4',
      type: 'video/mp4',
      duration: 12,
    },
  },
  ...overrides,
});

describe('editor-utils track helpers', () => {
  it('treats muted=true and non-positive track volume as muted', () => {
    expect(isTrackMuted(makeTrack())).toBe(false);
    expect(isTrackMuted(makeTrack({ muted: true }))).toBe(true);
    expect(isTrackMuted(makeTrack({ volume: 0 }))).toBe(true);
  });

  it('toggleTrackMute immutably toggles a track mute flag', () => {
    const config = makeConfig();

    const nextConfig = toggleTrackMute(config, 'A1');
    const originalAudioTrack = config.tracks.find((track) => track.id === 'A1');

    expect(nextConfig).not.toBe(config);
    expect(nextConfig.tracks.find((track) => track.id === 'A1')).toMatchObject({ muted: true });
    expect(originalAudioTrack).not.toHaveProperty('muted');
    expect(nextConfig.tracks.find((track) => track.id === 'V1')).toBe(config.tracks.find((track) => track.id === 'V1'));
  });

  it('setTrackVolume immutably updates only the requested track volume', () => {
    const config = makeConfig();

    const nextConfig = setTrackVolume(config, 'A1', 0.35);
    const originalAudioTrack = config.tracks.find((track) => track.id === 'A1');

    expect(nextConfig).not.toBe(config);
    expect(nextConfig.tracks.find((track) => track.id === 'A1')).toMatchObject({ volume: 0.35 });
    expect(originalAudioTrack).not.toHaveProperty('volume');
    expect(nextConfig.tracks.find((track) => track.id === 'V1')).toBe(config.tracks.find((track) => track.id === 'V1'));
  });
});

describe('detachAudioFromVideo', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mutes the source video clip and creates a matching detached audio clip on an audio track', () => {
    vi.spyOn(Date, 'now').mockReturnValue(123456789);
    const config = makeConfig();

    const nextConfig = detachAudioFromVideo(config, 'clip-1');

    expect(nextConfig).not.toBe(config);
    expect(nextConfig.clips).toHaveLength(2);
    expect(nextConfig.clips.find((clip) => clip.id === 'clip-1')).toMatchObject({ volume: 0 });
    expect(nextConfig.clips.find((clip) => clip.id === 'clip-1')?.track).toBe('V1');
    expect(nextConfig.clips.find((clip) => clip.id === 'clip-1-123456789')).toMatchObject({
      id: 'clip-1-123456789',
      track: 'A1',
      asset: 'asset-video',
      assetEntry: config.clips[0].assetEntry,
      at: 3,
      from: 1,
      to: 5,
      speed: 1.25,
      volume: 0.8,
    });
  });

  it('returns the original config for image clips and already-muted clips', () => {
    const imageConfig = makeConfig({
      clips: [
        makeVideoClip({
          id: 'image-clip',
          asset: 'asset-image',
          assetEntry: {
            file: 'image.png',
            src: 'https://example.com/image.png',
            type: 'image/png',
          },
        }),
      ],
      registry: {
        'asset-image': {
          file: 'image.png',
          src: 'https://example.com/image.png',
          type: 'image/png',
        },
      },
    });
    const mutedConfig = makeConfig({
      clips: [makeVideoClip({ id: 'muted-clip', volume: 0 })],
    });

    expect(detachAudioFromVideo(imageConfig, 'image-clip')).toBe(imageConfig);
    expect(detachAudioFromVideo(mutedConfig, 'muted-clip')).toBe(mutedConfig);
  });

  it('auto-creates an audio track when none exists', () => {
    vi.spyOn(Date, 'now').mockReturnValue(987654321);
    const config = makeConfig({
      tracks: [makeTrack()],
    });

    const nextConfig = detachAudioFromVideo(config, 'clip-1');

    expect(nextConfig.tracks).toHaveLength(2);
    expect(nextConfig.tracks.find((track) => track.id === 'A1')).toMatchObject({
      id: 'A1',
      kind: 'audio',
      label: 'A1',
    });
    expect(nextConfig.clips.find((clip) => clip.id === 'clip-1-987654321')).toMatchObject({
      track: 'A1',
      volume: 0.8,
    });
  });
});
