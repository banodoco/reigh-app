import { describe, it, expect } from 'vitest';
import { extractSegmentImages } from '../segmentImages';

describe('extractSegmentImages', () => {
  it('returns empty info for null/undefined params', () => {
    const result = extractSegmentImages(null);
    expect(result.hasImages).toBe(false);
    expect(result.startUrl).toBeUndefined();
    expect(result.endUrl).toBeUndefined();
  });

  it('extracts explicit start/end URLs from individual_segment_params', () => {
    const result = extractSegmentImages({
      individual_segment_params: {
        start_image_url: 'https://start.png',
        end_image_url: 'https://end.png',
        start_image_generation_id: 'gen-start',
        end_image_generation_id: 'gen-end',
      },
    });
    expect(result.startUrl).toBe('https://start.png');
    expect(result.endUrl).toBe('https://end.png');
    expect(result.startGenId).toBe('gen-start');
    expect(result.endGenId).toBe('gen-end');
    expect(result.hasImages).toBe(true);
  });

  it('extracts from top-level start/end URLs', () => {
    const result = extractSegmentImages({
      start_image_url: 'https://start.png',
      end_image_url: 'https://end.png',
    });
    expect(result.startUrl).toBe('https://start.png');
    expect(result.endUrl).toBe('https://end.png');
  });

  it('extracts from array-based orchestrator_details', () => {
    const result = extractSegmentImages({
      orchestrator_details: {
        input_image_paths_resolved: ['https://a.png', 'https://b.png', 'https://c.png'],
        input_image_generation_ids: ['gen-a', 'gen-b', 'gen-c'],
      },
    }, 1);
    expect(result.startUrl).toBe('https://b.png');
    expect(result.endUrl).toBe('https://c.png');
    expect(result.startGenId).toBe('gen-b');
    expect(result.endGenId).toBe('gen-c');
  });

  it('uses default segmentIndex of 0', () => {
    const result = extractSegmentImages({
      orchestrator_details: {
        input_image_paths_resolved: ['https://first.png', 'https://second.png'],
      },
    });
    expect(result.startUrl).toBe('https://first.png');
    expect(result.endUrl).toBe('https://second.png');
  });

  it('prefers explicit URLs over array-based', () => {
    const result = extractSegmentImages({
      individual_segment_params: {
        start_image_url: 'https://explicit.png',
      },
      orchestrator_details: {
        input_image_paths_resolved: ['https://array.png', 'https://array2.png'],
      },
    });
    expect(result.startUrl).toBe('https://explicit.png');
    expect(result.endUrl).toBe('https://array2.png');
  });

  it('cleans quoted URLs', () => {
    const result = extractSegmentImages({
      start_image_url: '"https://quoted.png"',
      end_image_url: "'https://single-quoted.png'",
    });
    expect(result.startUrl).toBe('https://quoted.png');
    expect(result.endUrl).toBe('https://single-quoted.png');
  });

  it('falls back to top-level input_image_paths_resolved', () => {
    const result = extractSegmentImages({
      input_image_paths_resolved: ['https://a.png', 'https://b.png'],
    });
    expect(result.startUrl).toBe('https://a.png');
    expect(result.endUrl).toBe('https://b.png');
  });

  it('handles empty params', () => {
    const result = extractSegmentImages({});
    expect(result.hasImages).toBe(false);
  });

  it('ignores malformed array payloads instead of force-casting', () => {
    const result = extractSegmentImages({
      orchestrator_details: {
        input_image_paths_resolved: ['https://a.png', 123, null],
        input_image_generation_ids: ['gen-a', { bad: true }, null],
      },
    } as unknown as Record<string, unknown>);
    expect(result.startUrl).toBe('https://a.png');
    expect(result.endUrl).toBeUndefined();
    expect(result.startGenId).toBe('gen-a');
    expect(result.endGenId).toBeUndefined();
  });
});
