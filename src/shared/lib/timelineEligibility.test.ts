import { describe, expect, it } from 'vitest';
import {
  filterTimelineEligiblePositionedImages,
  hasPositionedTimelineFrame,
  hasTimelineVideoExtension,
  isTimelineEligiblePositionedImage,
  isTimelineVideoLike,
  isTimelineVideoType,
} from './timelineEligibility';

describe('timelineEligibility', () => {
  it('detects timeline video extensions and known video types', () => {
    expect(hasTimelineVideoExtension('https://cdn.example.com/x.MP4')).toBe(true);
    expect(hasTimelineVideoExtension('https://cdn.example.com/x.png')).toBe(false);
    expect(isTimelineVideoType('video')).toBe(true);
    expect(isTimelineVideoType('video_travel_output')).toBe(true);
    expect(isTimelineVideoType('image')).toBe(false);
  });

  it('treats nested generation video metadata as video-like', () => {
    expect(isTimelineVideoLike({ generation: { type: 'video' } })).toBe(true);
    expect(isTimelineVideoLike({ generation: { location: 'https://cdn.example.com/out.mov' } })).toBe(true);
    expect(isTimelineVideoLike({ type: 'image', location: 'https://cdn.example.com/frame.png' })).toBe(false);
  });

  it('requires positioned frames and non-video media for eligibility', () => {
    expect(hasPositionedTimelineFrame(0)).toBe(true);
    expect(hasPositionedTimelineFrame(-1)).toBe(false);
    expect(hasPositionedTimelineFrame(null)).toBe(false);

    expect(isTimelineEligiblePositionedImage({
      timeline_frame: 10,
      type: 'image',
      location: 'https://cdn.example.com/frame.png',
    })).toBe(true);

    expect(isTimelineEligiblePositionedImage({
      timeline_frame: 10,
      type: 'video',
    })).toBe(false);
  });

  it('filters out non-eligible timeline rows', () => {
    const rows = [
      { id: 'kept', timeline_frame: 12, type: 'image', location: 'https://cdn.example.com/a.png' },
      { id: 'video', timeline_frame: 4, type: 'video' },
      { id: 'negative', timeline_frame: -1, type: 'image' },
      { id: 'extension', timeline_frame: 2, location: 'https://cdn.example.com/out.webm' },
    ];

    const filtered = filterTimelineEligiblePositionedImages(rows);

    expect(filtered).toEqual([rows[0]]);
  });
});
