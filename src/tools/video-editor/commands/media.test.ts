import { describe, expect, it } from 'vitest';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';
import { buildSwitchShotGroupToFinalVideoMutation } from '@/tools/video-editor/lib/shot-group-commands.ts';
import { buildTimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import type { AssetRegistry } from '@/tools/video-editor/types/index.ts';
import { applyPreparedMediaCommand } from './media.ts';

describe('prepared media command', () => {
  it('persists the prepared registry entry and clip replacement in one compound mutation', async () => {
    const config = {
      ...createDefaultTimelineConfig(),
      tracks: [{ id: 'V1', kind: 'visual' as const, label: 'V1' }],
      clips: [{
        id: 'clip-old',
        at: 0,
        track: 'V1',
        clipType: 'hold' as const,
        hold: 2,
        asset: 'asset-old',
      }],
    };
    const registry: AssetRegistry = {
      assets: {
        'asset-old': { file: 'old.png', type: 'image/png' },
      },
    };
    const current = await buildTimelineData(config, registry);
    const preparedEntry = {
      file: 'new.png',
      type: 'image/png',
      generationId: 'generation-new',
    };

    const result = applyPreparedMediaCommand(current, {
      type: 'place-prepared-media',
      payload: {
        asset: {
          assetKey: 'asset-new',
          mediaType: 'image',
          durationSeconds: 2,
          entry: preparedEntry,
          source: 'registered',
        },
        trackId: 'V1',
        at: 0,
        removeClipId: 'clip-old',
      },
    });

    expect(result).not.toBeNull();
    expect(result?.nextData.registry.assets['asset-new']).toEqual(preparedEntry);
    expect(result?.nextData.config.clips).toEqual([
      expect.objectContaining({ asset: 'asset-new', track: 'V1' }),
    ]);
    expect(result?.nextData.config.clips.some((clip) => clip.id === 'clip-old')).toBe(false);
    expect(result?.history).toMatchObject({
      appliedCount: 1,
      commandTypes: ['place-prepared-media'],
      failedCount: 0,
    });
  });

  it('rejects a prepared placement whose deferred target no longer exists', async () => {
    const current = await buildTimelineData(
      {
        ...createDefaultTimelineConfig(),
        tracks: [{ id: 'V1', kind: 'visual' as const, label: 'V1' }],
        clips: [],
      },
      { assets: {} },
    );

    const result = applyPreparedMediaCommand(current, {
      type: 'place-prepared-media',
      payload: {
        asset: {
          assetKey: 'asset-new',
          mediaType: 'image',
          durationSeconds: 1,
          entry: { file: 'new.png', type: 'image/png' },
          source: 'registered',
        },
        trackId: 'V1',
        at: 0,
        removeClipId: 'clip-deleted',
      },
    });

    expect(result).toBeNull();
  });

  it('keeps the prepared replacement clip id aligned with pinned group membership after source removal', async () => {
    const current = await buildTimelineData(
      {
        ...createDefaultTimelineConfig(),
        tracks: [{ id: 'V1', kind: 'visual' as const, label: 'V1' }],
        clips: [
          { id: 'clip-1', at: 0, track: 'V1', clipType: 'hold' as const, hold: 2, asset: 'asset-one' },
          { id: 'clip-2', at: 2, track: 'V1', clipType: 'hold' as const, hold: 2, asset: 'asset-two' },
        ],
        pinnedShotGroups: [{
          shotId: 'shot-1',
          trackId: 'V1',
          clipIds: ['clip-1', 'clip-2'],
          mode: 'images',
        }],
      },
      {
        assets: {
          'asset-one': { file: 'one.png', type: 'image/png' },
          'asset-two': { file: 'two.png', type: 'image/png' },
        },
      },
    );

    const mutation = buildSwitchShotGroupToFinalVideoMutation({
      currentData: current,
      shotId: 'shot-1',
      rowId: 'V1',
      clipIds: ['clip-1', 'clip-2'],
      assetKey: 'asset-final',
      durationSeconds: 4,
    });
    expect(mutation).not.toBeNull();
    const replacementClipId = Object.keys(mutation?.metaUpdates ?? {})[0];
    const replacementAction = mutation?.rows[0]?.actions.find((action) => action.id === replacementClipId);

    const result = applyPreparedMediaCommand(current, {
      type: 'place-prepared-media',
      payload: {
        asset: {
          assetKey: 'asset-final',
          mediaType: 'video',
          durationSeconds: 4,
          entry: { file: 'final.mp4', type: 'video/mp4' },
          source: 'registered',
        },
        trackId: 'V1',
        at: replacementAction?.start ?? 0,
        clipSpanSeconds: replacementAction ? replacementAction.end - replacementAction.start : 4,
        clipId: replacementClipId,
        removeClipIds: mutation?.metaDeletes,
        pinnedShotGroupsOverride: mutation?.pinnedShotGroupsOverride
          ? JSON.parse(JSON.stringify(mutation.pinnedShotGroupsOverride))
          : undefined,
      },
    });

    expect(result?.nextData.config.clips).toEqual([
      expect.objectContaining({ id: replacementClipId, asset: 'asset-final' }),
    ]);
    expect(result?.nextData.config.pinnedShotGroups).toEqual([expect.objectContaining({
      clipIds: [replacementClipId],
    })]);
  });

  it('preserves replacement clip metadata while changing the prepared asset and duration bounds', async () => {
    const current = await buildTimelineData(
      {
        ...createDefaultTimelineConfig(),
        tracks: [{ id: 'V1', kind: 'visual' as const, label: 'V1' }],
        clips: [{
          id: 'clip-3',
          at: 7,
          track: 'V1',
          clipType: 'media' as const,
          asset: 'asset-old',
          from: 1,
          to: 11,
          speed: 2,
          volume: 0.4,
          opacity: 0.6,
          cropTop: 0.1,
          cropBottom: 0.2,
          cropLeft: 0.3,
          cropRight: 0.4,
          effects: { blur: 0.5 },
        }],
        pinnedShotGroups: [{
          shotId: 'shot-1',
          trackId: 'V1',
          clipIds: ['clip-3'],
          mode: 'video',
          videoAssetKey: 'asset-old',
        }],
      },
      {
        assets: {
          'asset-old': { file: 'old.mp4', type: 'video/mp4', generationId: 'old' },
        },
      },
    );

    const result = applyPreparedMediaCommand(current, {
      type: 'place-prepared-media',
      payload: {
        asset: {
          assetKey: 'asset-new',
          mediaType: 'video',
          durationSeconds: 3,
          entry: { file: 'new.mp4', type: 'video/mp4', generationId: 'new' },
          source: 'registered',
        },
        trackId: 'V1',
        at: 7,
        clipSpanSeconds: 3,
        clipId: 'clip-3',
        replaceClipId: 'clip-3',
        pinnedShotGroupsOverride: [{
          shotId: 'shot-1',
          trackId: 'V1',
          clipIds: ['clip-3'],
          mode: 'video',
          videoAssetKey: 'asset-new',
        }],
      },
    });

    expect(result?.nextData.config.clips).toEqual([expect.objectContaining({
      id: 'clip-3',
      asset: 'asset-new',
      at: 7,
      from: 1,
      to: 7,
      speed: 2,
      volume: 0.4,
      opacity: 0.6,
      cropTop: 0.1,
      cropBottom: 0.2,
      cropLeft: 0.3,
      cropRight: 0.4,
      effects: { blur: 0.5 },
    })]);
    expect(result?.nextData.config.clips[0]?.at).toBe(7);
    expect(result?.nextData.rows[0]?.actions).toEqual([
      { id: 'clip-3', start: 7, end: 10, effectId: 'effect-clip-3' },
    ]);
  });

  it('uses normal duplicate ripple and metadata behavior for prepared afterClipId placement', async () => {
    const current = await buildTimelineData(
      {
        ...createDefaultTimelineConfig(),
        tracks: [{ id: 'V1', kind: 'visual' as const, label: 'V1' }],
        clips: [
          {
            id: 'clip-1',
            at: 0,
            track: 'V1',
            clipType: 'hold' as const,
            hold: 2,
            asset: 'asset-old',
            opacity: 0.5,
            effects: { glow: 1 },
          },
          { id: 'clip-2', at: 4, track: 'V1', clipType: 'hold' as const, hold: 2, asset: 'asset-after' },
        ],
      },
      {
        assets: {
          'asset-old': { file: 'old.png', type: 'image/png' },
          'asset-after': { file: 'after.png', type: 'image/png' },
        },
      },
    );

    const result = applyPreparedMediaCommand(current, {
      type: 'place-prepared-media',
      payload: {
        asset: {
          assetKey: 'asset-copy',
          mediaType: 'video',
          durationSeconds: 2,
          entry: { file: 'copy.mp4', type: 'video/mp4' },
          source: 'registered',
        },
        at: 0,
        afterClipId: 'clip-1',
      },
    });

    expect(result?.nextData.rows[0]?.actions).toEqual([
      { id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' },
      { id: 'clip-3', start: 2, end: 4, effectId: 'effect-clip-3' },
      { id: 'clip-2', start: 6, end: 8, effectId: 'effect-clip-2' },
    ]);
    expect(result?.nextData.config.clips).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'clip-3',
        asset: 'asset-copy',
        opacity: 0.5,
        effects: { glow: 1 },
      }),
    ]));
  });
});
