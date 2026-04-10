import { describe, expect, it } from 'vitest';
import { repairConfig } from '@/tools/video-editor/lib/migrate';
import { configToRows, type TimelineData } from '@/tools/video-editor/lib/timeline-data';
import {
  buildPinShotGroupMutation,
  buildUnpinShotGroupMutation,
  buildUpdateShotGroupToLatestVideoMutation,
} from '@/tools/video-editor/lib/shot-group-commands';
import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types';

function makeTimelineData(config: TimelineConfig, registry: AssetRegistry): TimelineData {
  const canonicalConfig = repairConfig(config);
  const rowData = configToRows(canonicalConfig);

  return {
    config: canonicalConfig,
    configVersion: 1,
    registry,
    resolvedConfig: {
      output: { ...canonicalConfig.output },
      tracks: (canonicalConfig.tracks ?? []).map((track) => ({ ...track })),
      clips: canonicalConfig.clips.map((clip) => ({
        ...clip,
        assetEntry: clip.asset ? {
          ...registry.assets[clip.asset],
          src: registry.assets[clip.asset]?.file ?? '',
        } : undefined,
      })),
      registry: Object.fromEntries(
        Object.entries(registry.assets).map(([assetId, entry]) => [
          assetId,
          { ...entry, src: entry.file },
        ]),
      ),
    },
    rows: rowData.rows,
    meta: rowData.meta,
    effects: rowData.effects,
    assetMap: Object.fromEntries(Object.entries(registry.assets).map(([assetId, entry]) => [assetId, entry.file])),
    output: { ...canonicalConfig.output },
    tracks: (canonicalConfig.tracks ?? []).map((track) => ({ ...track })),
    clipOrder: rowData.clipOrder,
    signature: 'signature',
    stableSignature: 'stable-signature',
  };
}

describe('shot-group-commands', () => {
  it('buildPinShotGroupMutation orders clip ids by live timeline position', () => {
    const currentData = makeTimelineData(
      {
        output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
        tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
        clips: [
          { id: 'clip-1', at: 4, track: 'V1', clipType: 'hold', hold: 2 },
          { id: 'clip-2', at: 1, track: 'V1', clipType: 'hold', hold: 3 },
        ],
      },
      { assets: {} },
    );

    expect(buildPinShotGroupMutation(currentData, {
      shotId: 'shot-1',
      trackId: 'V1',
      clipIds: ['clip-1', 'clip-2'],
      mode: 'images',
    })).toEqual({
      type: 'pinnedShotGroups',
      pinnedShotGroups: [{
        shotId: 'shot-1',
        trackId: 'V1',
        clipIds: ['clip-2', 'clip-1'],
        mode: 'images',
      }],
    });
  });

  it('buildUnpinShotGroupMutation removes only the targeted pinned group', () => {
    const currentData = makeTimelineData(
      {
        output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
        tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
        clips: [
          { id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', hold: 2 },
          { id: 'clip-2', at: 2, track: 'V1', clipType: 'hold', hold: 2 },
        ],
        pinnedShotGroups: [
          { shotId: 'shot-1', trackId: 'V1', clipIds: ['clip-1'], mode: 'images' },
          { shotId: 'shot-2', trackId: 'V1', clipIds: ['clip-2'], mode: 'images' },
        ],
      },
      { assets: {} },
    );

    expect(buildUnpinShotGroupMutation(currentData, { shotId: 'shot-1', trackId: 'V1' })).toEqual({
      type: 'pinnedShotGroups',
      pinnedShotGroups: [{
        shotId: 'shot-2',
        trackId: 'V1',
        clipIds: ['clip-2'],
        mode: 'images',
      }],
    });
  });

  it('buildUpdateShotGroupToLatestVideoMutation updates both the clip asset and group videoAssetKey', () => {
    const currentData = makeTimelineData(
      {
        output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
        tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
        clips: [
          { id: 'clip-3', at: 7, track: 'V1', clipType: 'media', asset: 'asset-video', from: 0, to: 10, speed: 1 },
        ],
        pinnedShotGroups: [{
          shotId: 'shot-1',
          trackId: 'V1',
          clipIds: ['clip-3'],
          mode: 'video',
          videoAssetKey: 'asset-video',
          imageClipSnapshot: [
            { clipId: 'clip-1', assetKey: 'asset-1', start: 7, end: 10, meta: { clipType: 'hold', hold: 3 } },
          ],
        }],
      },
      {
        assets: {
          'asset-video': { file: 'video-old.mp4', type: 'video/mp4', generationId: 'final-old' },
          'asset-1': { file: 'one.png', type: 'image/png' },
          'asset-video-new': { file: 'video-new.mp4', type: 'video/mp4', generationId: 'final-new' },
        },
      },
    );

    expect(buildUpdateShotGroupToLatestVideoMutation({
      currentData,
      shotId: 'shot-1',
      rowId: 'V1',
      assetKey: 'asset-video-new',
      targetGenerationId: 'final-new',
    })).toEqual({
      type: 'rows',
      rows: currentData.rows,
      metaUpdates: {
        'clip-3': {
          asset: 'asset-video-new',
        },
      },
      pinnedShotGroupsOverride: [{
        shotId: 'shot-1',
        trackId: 'V1',
        clipIds: ['clip-3'],
        mode: 'video',
        videoAssetKey: 'asset-video-new',
        imageClipSnapshot: [
          { clipId: 'clip-1', assetKey: 'asset-1', start: 7, end: 10, meta: { clipType: 'hold', hold: 3 } },
        ],
      }],
    });
  });
});
