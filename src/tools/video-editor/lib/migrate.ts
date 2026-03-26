import { getClipTimelineDuration } from './config-utils';
import type {
  ClipContinuous,
  ClipEntrance,
  ClipExit,
  TimelineClip,
  TimelineConfig,
  TrackDefinition,
} from '@/tools/video-editor/types';

const DEFAULT_VIDEO_SCALE = 0.95;

const LEGACY_TRACK_MAP: Record<string, string> = {
  video: 'V2',
  overlay: 'V3',
  audio: 'A1',
};

const LEGACY_ASSET_EFFECTS: Record<
  string,
  { entrance?: ClipEntrance; exit?: ClipExit; continuous?: ClipContinuous }
> = {
  'output-composition': {
    entrance: { type: 'slide-up', duration: 0.6 },
    exit: { type: 'flip', duration: 0.6 },
    continuous: { type: 'float', intensity: 0.45 },
  },
  'venn-diagram': {
    entrance: { type: 'zoom-spin', duration: 0.6 },
    exit: { type: 'zoom-out', duration: 0.5 },
    continuous: { type: 'ken-burns', intensity: 0.55 },
  },
  'demo-one': {
    entrance: { type: 'slide-right', duration: 0.6 },
    exit: { type: 'slide-down', duration: 0.5 },
    continuous: { type: 'glitch', intensity: 0.45 },
  },
  'demo-two': {
    entrance: { type: 'pulse', duration: 0.5 },
    exit: { type: 'flip', duration: 0.6 },
  },
};

const roundTimelineValue = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const getDefaultTracks = (config: TimelineConfig): TrackDefinition[] => {
  const videoScale = config.output.background_scale ?? DEFAULT_VIDEO_SCALE;
  return [
    {
      id: 'V1',
      kind: 'visual',
      label: 'V1',
      scale: 1,
      fit: 'cover',
      opacity: 1,
      blendMode: 'normal',
    },
    {
      id: 'V2',
      kind: 'visual',
      label: 'V2',
      scale: videoScale,
      fit: 'contain',
      opacity: 1,
      blendMode: 'normal',
    },
    {
      id: 'V3',
      kind: 'visual',
      label: 'V3',
      scale: 1,
      fit: 'manual',
      opacity: 1,
      blendMode: 'normal',
    },
    {
      id: 'A1',
      kind: 'audio',
      label: 'A1',
      scale: 1,
      fit: 'contain',
      opacity: 1,
      blendMode: 'normal',
    },
  ];
};

const migrateLegacyEffects = (clip: TimelineClip): TimelineClip => {
  const nextClip: TimelineClip = { ...clip };
  const fadeIn = clip.effects && !Array.isArray(clip.effects) ? clip.effects.fade_in : undefined;
  const fadeOut = clip.effects && !Array.isArray(clip.effects) ? clip.effects.fade_out : undefined;
  const fallback = clip.asset ? LEGACY_ASSET_EFFECTS[clip.asset] : undefined;

  if (!nextClip.entrance && typeof fadeIn === 'number' && fadeIn > 0) {
    nextClip.entrance = { type: 'fade', duration: fadeIn };
  } else if (!nextClip.entrance && fallback?.entrance) {
    nextClip.entrance = fallback.entrance;
  }

  if (!nextClip.exit && typeof fadeOut === 'number' && fadeOut > 0) {
    nextClip.exit = { type: 'fade-out', duration: fadeOut };
  } else if (!nextClip.exit && fallback?.exit) {
    nextClip.exit = fallback.exit;
  }

  if (!nextClip.continuous && fallback?.continuous) {
    nextClip.continuous = fallback.continuous;
  }

  delete nextClip.effects;
  return nextClip;
};

const migrateLegacyClip = (clip: TimelineClip): TimelineClip => {
  const nextTrack = LEGACY_TRACK_MAP[clip.track] ?? clip.track;
  const clipType = clip.clipType
    ?? (clip.text ? 'text' : typeof clip.hold === 'number' ? 'hold' : 'media');

  return migrateLegacyEffects({
    ...clip,
    track: nextTrack,
    clipType,
  });
};

const getTimelineEndSeconds = (config: TimelineConfig): number => {
  return Math.max(
    0,
    ...config.clips.map((clip) => clip.at + getClipTimelineDuration(clip)),
  );
};

const ensureBackgroundClip = (config: TimelineConfig): TimelineClip[] => {
  const backgroundAsset = config.output.background;
  if (!backgroundAsset) {
    return config.clips.map(migrateLegacyClip);
  }

  const migratedClips = config.clips.map(migrateLegacyClip);
  const alreadyPresent = migratedClips.some((clip) => clip.track === 'V1');
  if (alreadyPresent) {
    return migratedClips;
  }

  const timelineDuration = Math.max(0.1, roundTimelineValue(getTimelineEndSeconds(config)));
  return [
    {
      id: 'clip-background',
      at: 0,
      track: 'V1',
      clipType: 'hold',
      asset: backgroundAsset,
      hold: timelineDuration,
      opacity: 1,
    },
    ...migratedClips,
  ];
};

/** Strip cascading `-dup-N` suffixes from a clip id back to its base. */
const stripDupSuffix = (id: string): string => id.replace(/(-dup-\d+)+$/, '');

/** Assign unique ids to clips, stripping stale `-dup-` chains first. */
const deduplicateClipIds = (clips: TimelineClip[]): TimelineClip[] => {
  const used = new Set<string>();
  return clips.map((clip) => {
    const base = stripDupSuffix(clip.id);
    let candidate = base;
    let i = 1;
    while (used.has(candidate)) {
      candidate = `${base}-dup-${i}`;
      i += 1;
    }
    used.add(candidate);
    return candidate === clip.id ? clip : { ...clip, id: candidate };
  });
};

export const migrateToFlatTracks = (config: TimelineConfig): TimelineConfig => {
  if (config.tracks?.length) {
    // Deduplicate tracks by id — earlier mutations could have pushed duplicates
    // into the shared array, which then got persisted to the server.
    const seen = new Set<string>();
    const dedupedTracks = config.tracks.filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
    return {
      output: { ...config.output },
      tracks: dedupedTracks.map((track) => ({ ...track })),
      clips: deduplicateClipIds(config.clips.map((clip) => ({
        ...clip,
        clipType: clip.clipType
          ?? (clip.text ? 'text' : typeof clip.hold === 'number' ? 'hold' : 'media'),
      }))),
      customEffects: config.customEffects ? { ...config.customEffects } : undefined,
    };
  }

  return {
    output: { ...config.output },
    tracks: getDefaultTracks(config),
    clips: ensureBackgroundClip(config),
    customEffects: config.customEffects ? { ...config.customEffects } : undefined,
  };
};
