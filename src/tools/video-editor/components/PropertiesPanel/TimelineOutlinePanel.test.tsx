import { describe, expect, it } from 'vitest';
import { buildTimelineOutlineItems, formatOutlineTime } from './TimelineOutlinePanel';

describe('TimelineOutlinePanel projection', () => {
  it('projects the resolved timeline into chronological, track-labelled items', () => {
    const items = buildTimelineOutlineItems({
      tracks: [
        { id: 'visual-1', kind: 'visual', label: 'Visual' },
        { id: 'audio-1', kind: 'audio', label: 'Audio' },
      ],
      clips: [
        { id: 'late', track: 'audio-1', clipType: 'audio', start: 4, end: 6, label: '' },
        { id: 'early', track: 'visual-1', clipType: 'image', start: 0, end: 2, label: 'Opening', asset: 'asset-opening' },
        { id: 'middle', track: 'visual-1', clipType: 'text', start: 2, end: 4, text: { content: 'Caption' } },
      ],
    } as never);

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
