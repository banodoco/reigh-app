import { describe, expect, it } from 'vitest';
import type { ClipMeta } from '@/tools/video-editor/lib/timeline-data';
import type { TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
import { resolveSelectedGenerationIdsForShotCreation } from './TimelineEditor';

describe('resolveSelectedGenerationIdsForShotCreation', () => {
  const rows: TimelineRow[] = [
    {
      id: 'V1',
      actions: [
        { id: 'clip-2', start: 5, end: 8, effectId: 'effect-2' },
        { id: 'clip-1', start: 1, end: 4, effectId: 'effect-1' },
      ],
    },
    {
      id: 'V2',
      actions: [
        { id: 'clip-3', start: 0, end: 2, effectId: 'effect-3' },
      ],
    },
  ];

  const meta: Record<string, ClipMeta> = {
    'clip-1': { asset: 'asset-1', track: 'V1', clipType: 'media' },
    'clip-2': { asset: 'asset-2', track: 'V1', clipType: 'media' },
    'clip-3': { asset: 'asset-3', track: 'V2', clipType: 'media' },
  };

  it('sorts selected generation ids by track index and clip start', () => {
    const assetGenerationMap = {
      'asset-1': 'gen-1',
      'asset-2': 'gen-2',
      'asset-3': 'gen-3',
    };

    const result = resolveSelectedGenerationIdsForShotCreation({
      rows,
      meta,
      assetGenerationMap,
      selectedClipIds: ['clip-3', 'clip-1', 'clip-2'],
    });

    expect(result).toEqual({
      canCreateShot: true,
      generationIds: ['gen-1', 'gen-2', 'gen-3'],
    });
  });

  it('marks the selection as ineligible when any selected clip lacks a generation id', () => {
    const assetGenerationMap = {
      'asset-1': 'gen-1',
      'asset-3': 'gen-3',
    };

    const result = resolveSelectedGenerationIdsForShotCreation({
      rows,
      meta,
      assetGenerationMap,
      selectedClipIds: ['clip-1', 'clip-2', 'clip-3'],
    });

    expect(result.canCreateShot).toBe(false);
    expect(result.generationIds).toEqual(['gen-1', 'gen-3']);
  });
});
