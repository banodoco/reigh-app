import type {
  AssetRegistry,
  ResolvedAssetRegistryEntry,
  ResolvedTimelineConfig,
  TimelineClip,
  TimelineConfig,
} from '@/tools/video-editor/types';

export const parseResolution = (resolution: string): { width: number; height: number } => {
  const [width, height] = resolution.toLowerCase().split('x');
  return {
    width: Number(width),
    height: Number(height),
  };
};

export const getClipSourceDuration = (clip: TimelineClip): number => {
  if (typeof clip.hold === 'number') {
    return clip.hold;
  }

  return (clip.to ?? 0) - (clip.from ?? 0);
};

export const getClipTimelineDuration = (clip: TimelineClip): number => {
  const speed = clip.speed ?? 1;
  return getClipSourceDuration(clip) / speed;
};

export const secondsToFrames = (seconds: number, fps: number): number => {
  return Math.round(seconds * fps);
};

export const getClipDurationInFrames = (clip: TimelineClip, fps: number): number => {
  return Math.max(1, secondsToFrames(getClipTimelineDuration(clip), fps));
};

export const getTimelineDurationInFrames = (config: ResolvedTimelineConfig, fps: number): number => {
  return Math.max(
    1,
    ...config.clips.map((clip) => {
      return secondsToFrames(clip.at, fps) + getClipDurationInFrames(clip, fps);
    }),
  );
};

export const getEffectValue = (
  effects: TimelineClip['effects'],
  name: 'fade_in' | 'fade_out',
): number | null => {
  if (!effects) {
    return null;
  }

  if (!Array.isArray(effects)) {
    return typeof effects[name] === 'number' ? effects[name] : null;
  }

  for (const effect of effects) {
    if (typeof effect[name] === 'number') {
      return effect[name] ?? null;
    }
  }

  return null;
};

export const getConfigSignature = (
  config: ResolvedTimelineConfig | TimelineConfig,
): string => JSON.stringify(config);

const normalizeForStableJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => {
      const normalized = normalizeForStableJson(item);
      return normalized === undefined ? null : normalized;
    });
  }

  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const normalized = normalizeForStableJson((value as Record<string, unknown>)[key]);
        if (normalized !== undefined) {
          acc[key] = normalized;
        }
        return acc;
      }, {});
  }

  return value;
};

export const getStableConfigSignature = (
  config: TimelineConfig,
  registry: AssetRegistry,
): string => {
  return JSON.stringify(normalizeForStableJson({
    config,
    registry,
  }));
};

export type UrlResolver = (file: string) => string | Promise<string>;

export const isRemoteUrl = (url: string): boolean => /^https?:\/\//.test(url);

export const resolveTimelineConfig = async (
  config: TimelineConfig,
  registry: AssetRegistry,
  resolveUrl: UrlResolver,
): Promise<ResolvedTimelineConfig> => {
  const resolvedRegistry: Record<string, ResolvedAssetRegistryEntry> = {};

  await Promise.all(
    Object.entries(registry.assets ?? {}).map(async ([assetId, entry]) => {
      resolvedRegistry[assetId] = {
        ...entry,
        src: isRemoteUrl(entry.file) ? entry.file : await resolveUrl(entry.file),
      };
    }),
  );

  const clips = config.clips.map((clip) => {
    if (!clip.asset) {
      return {
        ...clip,
        assetEntry: undefined,
      };
    }

    const assetEntry = resolvedRegistry[clip.asset];
    if (!assetEntry) {
      console.warn(`Clip '${clip.id}' references missing asset '${clip.asset}' - skipping`);
      return {
        ...clip,
        assetEntry: undefined,
      };
    }

    return {
      ...clip,
      assetEntry,
    };
  });

  return {
    output: { ...config.output },
    tracks: config.tracks ?? [],
    clips,
    registry: resolvedRegistry,
  };
};
