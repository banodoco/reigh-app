import { describe, expect, it } from 'vitest';
import { getConfigSignature } from '@/tools/video-editor/lib/config-utils';
import { migrateToFlatTracks } from '@/tools/video-editor/lib/migrate';
import { buildDataFromCurrentRegistry } from '@/tools/video-editor/lib/timeline-save-utils';
import { assembleTimelineData } from '@/tools/video-editor/lib/timeline-data';
import type {
  AssetRegistry,
  ResolvedAssetRegistryEntry,
  ResolvedTimelineConfig,
  TimelineConfig,
  TrackDefinition,
} from '@/tools/video-editor/types';

const makeTrack = (id: string, kind: TrackDefinition['kind'] = 'visual'): TrackDefinition => ({
  id,
  kind,
  label: id,
  scale: 1,
  fit: kind === 'audio' ? 'contain' : 'manual',
  opacity: 1,
  blendMode: 'normal',
});

const makeAssetMap = (registry: AssetRegistry): Record<string, string> => {
  return Object.fromEntries(
    Object.entries(registry.assets).map(([assetId, entry]) => [assetId, entry.file]),
  );
};

const buildResolvedRegistry = (registry: AssetRegistry): Record<string, ResolvedAssetRegistryEntry> => {
  return Object.fromEntries(
    Object.entries(registry.assets).map(([assetId, entry]) => [
      assetId,
      {
        ...entry,
        src: `https://example.com/${entry.file}`,
      },
    ]),
  );
};

const buildResolvedConfig = (
  config: TimelineConfig,
  resolvedRegistry: Record<string, ResolvedAssetRegistryEntry>,
): ResolvedTimelineConfig => ({
  output: { ...config.output },
  tracks: config.tracks ?? [],
  clips: config.clips.map((clip) => ({
    ...clip,
    assetEntry: clip.asset ? resolvedRegistry[clip.asset] : undefined,
  })),
  registry: resolvedRegistry,
});

describe('timeline save utils regression coverage', () => {
  it('assembleTimelineData produces consistent output with the resolved-config signature', () => {
    const config: TimelineConfig = {
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
      tracks: [makeTrack('V1'), makeTrack('A1', 'audio')],
      clips: [
        { id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', asset: 'asset-1', hold: 3 },
        { id: 'clip-2', at: 1, track: 'A1', clipType: 'hold', asset: 'asset-2', hold: 2 },
      ],
    };
    const registry: AssetRegistry = {
      assets: {
        'asset-1': { file: 'video.mp4', duration: 3 },
        'asset-2': { file: 'audio.mp3', duration: 2 },
      },
    };
    const resolvedConfig = buildResolvedConfig(config, buildResolvedRegistry(registry));

    const data = assembleTimelineData({
      config,
      configVersion: 7,
      registry,
      resolvedConfig,
      output: { ...config.output },
      assetMap: makeAssetMap(registry),
    });

    expect(data.config).toBe(config);
    expect(data.registry).toBe(registry);
    expect(data.resolvedConfig).toBe(resolvedConfig);
    expect(data.configVersion).toBe(7);
    expect(data.output).toEqual(config.output);
    expect(data.assetMap).toEqual({
      'asset-1': 'video.mp4',
      'asset-2': 'audio.mp3',
    });
    expect(data.tracks.map((track) => track.id)).toEqual(['V1', 'A1']);
    expect(data.clipOrder).toEqual({
      V1: ['clip-1'],
      A1: ['clip-2'],
    });
    expect(data.rows).toEqual([
      {
        id: 'V1',
        actions: [{ id: 'clip-1', start: 0, end: 3, effectId: 'effect-clip-1' }],
      },
      {
        id: 'A1',
        actions: [{ id: 'clip-2', start: 1, end: 3, effectId: 'effect-clip-2' }],
      },
    ]);
    expect(Object.keys(data.meta)).toEqual(['clip-1', 'clip-2']);
    expect(Object.keys(data.effects)).toEqual(['effect-clip-1', 'effect-clip-2']);
    expect(data.signature).toBe(getConfigSignature(resolvedConfig));
  });

  it('deduplicates duplicate track ids through migrate then assemble', () => {
    const migratedConfig = migrateToFlatTracks({
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
      tracks: [makeTrack('V1'), makeTrack('V3'), makeTrack('V3')],
      clips: [{ id: 'clip-1', at: 0, track: 'V3', clipType: 'hold', asset: 'asset-1', hold: 2 }],
    });
    const registry: AssetRegistry = {
      assets: {
        'asset-1': { file: 'overlay.png' },
      },
    };
    const resolvedConfig = buildResolvedConfig(migratedConfig, buildResolvedRegistry(registry));

    const data = assembleTimelineData({
      config: migratedConfig,
      configVersion: 1,
      registry,
      resolvedConfig,
      output: { ...migratedConfig.output },
      assetMap: makeAssetMap(registry),
    });

    expect(migratedConfig.tracks?.map((track) => track.id)).toEqual(['V1', 'V3']);
    expect(data.tracks.map((track) => track.id)).toEqual(['V1', 'V3']);
    expect(data.rows.map((row) => row.id)).toEqual(['V1', 'V3']);
    expect(Object.keys(data.clipOrder)).toEqual(['V1', 'V3']);
    expect(data.clipOrder.V3).toEqual(['clip-1']);
  });

  it('cleans cascading duplicate clip ids through migrate then assemble', () => {
    const migratedConfig = migrateToFlatTracks({
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
      tracks: [makeTrack('V1')],
      clips: [
        { id: 'clip-7-dup-2-dup-1', at: 0, track: 'V1', clipType: 'hold', asset: 'asset-1', hold: 2 },
        { id: 'clip-7', at: 2, track: 'V1', clipType: 'hold', asset: 'asset-2', hold: 1 },
      ],
    });
    const registry: AssetRegistry = {
      assets: {
        'asset-1': { file: 'base.png' },
        'asset-2': { file: 'alt.png' },
      },
    };
    const resolvedConfig = buildResolvedConfig(migratedConfig, buildResolvedRegistry(registry));

    const data = assembleTimelineData({
      config: migratedConfig,
      configVersion: 1,
      registry,
      resolvedConfig,
      output: { ...migratedConfig.output },
      assetMap: makeAssetMap(registry),
    });

    expect(migratedConfig.clips.map((clip) => clip.id)).toEqual(['clip-7', 'clip-7-dup-1']);
    expect(data.clipOrder.V1).toEqual(['clip-7', 'clip-7-dup-1']);
    expect(Object.keys(data.meta)).toEqual(['clip-7', 'clip-7-dup-1']);
    expect(Object.keys(data.effects)).toEqual(['effect-clip-7', 'effect-clip-7-dup-1']);
    expect(Object.keys(data.meta).some((clipId) => /-dup-\d+-dup-\d+/.test(clipId))).toBe(false);
  });

  it('buildDataFromCurrentRegistry preserves registry objects from current data', () => {
    const currentConfig: TimelineConfig = {
      output: { resolution: '1920x1080', fps: 30, file: 'current.mp4' },
      tracks: [makeTrack('V1')],
      clips: [{ id: 'clip-current', at: 0, track: 'V1', clipType: 'hold', asset: 'asset-1', hold: 2 }],
    };
    const currentRegistry: AssetRegistry = {
      assets: {
        'asset-1': { file: 'current.png' },
        'asset-2': { file: 'next.png' },
      },
    };
    const currentResolvedRegistry = buildResolvedRegistry(currentRegistry);
    const current = assembleTimelineData({
      config: currentConfig,
      configVersion: 3,
      registry: currentRegistry,
      resolvedConfig: buildResolvedConfig(currentConfig, currentResolvedRegistry),
      output: { ...currentConfig.output },
      assetMap: makeAssetMap(currentRegistry),
    });
    const nextConfig: TimelineConfig = {
      output: { resolution: '1920x1080', fps: 30, file: 'next.mp4' },
      tracks: [makeTrack('V1')],
      clips: [{ id: 'clip-next', at: 1, track: 'V1', clipType: 'hold', asset: 'asset-2', hold: 4 }],
    };

    const data = buildDataFromCurrentRegistry(nextConfig, current);

    expect(data.registry).toBe(current.registry);
    expect(data.resolvedConfig.registry).toBe(current.resolvedConfig.registry);
    expect(data.assetMap).toEqual(makeAssetMap(current.registry));
    expect(data.resolvedConfig.clips[0]?.assetEntry).toBe(current.resolvedConfig.registry['asset-2']);
  });

  it('buildDataFromCurrentRegistry migrates configs with duplicate tracks before assembly', () => {
    const currentConfig: TimelineConfig = {
      output: { resolution: '1920x1080', fps: 30, file: 'current.mp4' },
      tracks: [makeTrack('V1')],
      clips: [{ id: 'clip-current', at: 0, track: 'V1', clipType: 'hold', asset: 'asset-1', hold: 2 }],
    };
    const currentRegistry: AssetRegistry = {
      assets: {
        'asset-1': { file: 'current.png' },
        'asset-2': { file: 'overlay.png' },
      },
    };
    const current = assembleTimelineData({
      config: currentConfig,
      configVersion: 4,
      registry: currentRegistry,
      resolvedConfig: buildResolvedConfig(currentConfig, buildResolvedRegistry(currentRegistry)),
      output: { ...currentConfig.output },
      assetMap: makeAssetMap(currentRegistry),
    });
    const data = buildDataFromCurrentRegistry({
      output: { resolution: '1920x1080', fps: 30, file: 'next.mp4' },
      tracks: [makeTrack('V1'), makeTrack('V3'), makeTrack('V3')],
      clips: [{ id: 'clip-overlay', at: 0, track: 'V3', clipType: 'hold', asset: 'asset-2', hold: 2 }],
    }, current);

    expect(data.config.tracks?.map((track) => track.id)).toEqual(['V1', 'V3']);
    expect(data.tracks.map((track) => track.id)).toEqual(['V1', 'V3']);
    expect(data.rows.map((row) => row.id)).toEqual(['V1', 'V3']);
    expect(Object.keys(data.clipOrder)).toEqual(['V1', 'V3']);
  });
});
