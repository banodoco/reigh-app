import { describe, expect, it } from 'vitest';
import { buildTimelineOutlineItems, formatOutlineTime } from './TimelineOutlinePanel';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';

describe('TimelineOutlinePanel projection', () => {
  it('projects the resolved timeline into chronological, track-labelled items', () => {
    const config: ResolvedTimelineConfig = {
      output: { resolution: '1920x1080', fps: 30, file: '' },
      tracks: [
        { id: 'visual-1', kind: 'visual', label: 'Visual' },
        { id: 'audio-1', kind: 'audio', label: 'Audio' },
      ],
      clips: [
        { id: 'late', track: 'audio-1', clipType: 'audio', at: 4, hold: 2, label: '' },
        { id: 'early', track: 'visual-1', clipType: 'image', at: 0, hold: 2, label: 'Opening', asset: 'asset-opening' },
        { id: 'middle', track: 'visual-1', clipType: 'text', at: 2, hold: 2, text: { content: 'Caption' } },
      ],
      registry: {},
    };
    const items = buildTimelineOutlineItems(config);

    expect(items.map((item) => item.id)).toEqual(['early', 'middle', 'late']);
    expect(items[0]).toMatchObject({ label: 'Opening', trackLabel: 'Visual', assetKey: 'asset-opening' });
    expect(items[1]).toMatchObject({ label: 'Caption', trackLabel: 'Visual' });
    expect(items[2]).toMatchObject({ label: 'audio', trackLabel: 'Audio' });
  });

  it('formats timeline times with a stable two-decimal display', () => {
    expect(formatOutlineTime(0)).toBe('0:00.00');
    expect(formatOutlineTime(61.2)).toBe('1:01.20');
    expect(formatOutlineTime(Number.NaN)).toBe('0:00.00');
  });
});
