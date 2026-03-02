import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMismatchMap,
  collectStartGenerationIds,
  type SegmentSourceInfo,
  type SourceSlotData,
} from '../sourceMismatchAnalysis';

const mocks = vi.hoisted(() => ({
  extractSegmentImages: vi.fn(),
}));

vi.mock('@/shared/lib/tasks/travelBetweenImages/segmentImages', () => ({
  extractSegmentImages: mocks.extractSegmentImages,
}));

describe('sourceMismatchAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-02T12:06:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collects unique start generation ids', () => {
    const segments: SegmentSourceInfo[] = [
      { segmentId: 's1', childOrder: 0, params: {}, startGenId: 'g1', endGenId: 'g2' },
      { segmentId: 's2', childOrder: 1, params: {}, startGenId: 'g1', endGenId: 'g3' },
      { segmentId: 's3', childOrder: 2, params: {}, startGenId: null, endGenId: null },
    ];

    expect(collectStartGenerationIds(segments)).toEqual(['g1']);
  });

  it('returns empty map when slot data is missing', () => {
    const segments: SegmentSourceInfo[] = [
      { segmentId: 's1', childOrder: 0, params: {}, startGenId: 'g1', endGenId: 'g2' },
    ];

    const mismatchMap = buildMismatchMap(segments, null);

    expect(mismatchMap.size).toBe(0);
  });

  it('normalizes urls and ignores equivalent paths', () => {
    mocks.extractSegmentImages.mockReturnValue({
      startUrl: 'https://cdn.example.com/a/start.png?cache=1',
      endUrl: 'https://cdn.example.com/a/end.png?cache=2',
    });

    const segments: SegmentSourceInfo[] = [
      { segmentId: 's-path', childOrder: 0, params: {}, startGenId: 'g1', endGenId: 'g2' },
    ];
    const slotData: SourceSlotData = {
      genToVariant: {
        g1: { location: 'https://cdn.example.com/a/start.png?different=1', updated_at: new Date('2026-03-02T12:00:00.000Z') },
        g2: { location: 'https://cdn.example.com/a/end.png?different=2', updated_at: new Date('2026-03-02T12:00:30.000Z') },
      },
      startGenToNext: {
        g1: { nextGenId: 'g2', nextSlotUpdatedAt: new Date('2026-03-02T12:01:00.000Z') },
      },
    };

    const mismatchMap = buildMismatchMap(segments, slotData);

    expect(mismatchMap.size).toBe(0);
  });

  it('records mismatch and uses next-slot timestamp for reorder mismatches', () => {
    mocks.extractSegmentImages.mockReturnValue({
      startUrl: 'https://cdn.example.com/start-old.png',
      endUrl: 'https://cdn.example.com/end-old.png',
    });

    const segments: SegmentSourceInfo[] = [
      { segmentId: 's-reorder', childOrder: 0, params: {}, startGenId: 'g1', endGenId: 'g9' },
    ];
    const slotData: SourceSlotData = {
      genToVariant: {
        g1: { location: 'https://cdn.example.com/start-new.png', updated_at: new Date('2026-03-02T12:01:00.000Z') },
        g2: { location: 'https://cdn.example.com/end-new.png', updated_at: new Date('2026-03-02T12:03:00.000Z') },
      },
      startGenToNext: {
        g1: { nextGenId: 'g2', nextSlotUpdatedAt: new Date('2026-03-02T12:05:00.000Z') },
      },
    };

    const mismatchMap = buildMismatchMap(segments, slotData);
    const mismatch = mismatchMap.get('s-reorder');

    expect(mismatchMap.size).toBe(1);
    expect(mismatch).toEqual({
      segmentId: 's-reorder',
      hasMismatch: true,
      isRecent: true,
      startMismatch: true,
      endMismatch: true,
      changedAt: new Date('2026-03-02T12:05:00.000Z'),
    });
  });
});
