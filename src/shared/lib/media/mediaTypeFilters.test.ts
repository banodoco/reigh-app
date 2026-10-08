import { describe, expect, it } from 'vitest';
import { isAudioMedia, isImageMedia, isVideoMedia } from './mediaTypeFilters';

describe('media type filters', () => {
  const image = { type: 'image', url: '/image.png', isVideo: false };
  const audio = { type: 'audio', url: '/audio.aac', isVideo: false };
  const video = { type: 'video', url: '/video.mp4', isVideo: true };

  it('recognizes actual images only', () => {
    expect(isImageMedia(image)).toBe(true);
    expect(isImageMedia(audio)).toBe(false);
    expect(isImageMedia(video)).toBe(false);
  });

  it('recognizes videos only', () => {
    expect(isVideoMedia(image)).toBe(false);
    expect(isVideoMedia(audio)).toBe(false);
    expect(isVideoMedia(video)).toBe(true);
  });

  it('supports image MIME-like types without treating audio as image', () => {
    expect(isImageMedia({ type: 'image/png' })).toBe(true);
    expect(isImageMedia({ contentType: 'image/jpeg' })).toBe(true);
    expect(isImageMedia({ contentType: 'audio/mpeg' })).toBe(false);
  });

  it('recognizes catalog audio with opaque URLs, MIME hints, and audio file extensions', () => {
    expect(isAudioMedia({ type: 'audio', url: 'sha256:abc' })).toBe(true);
    expect(isAudioMedia({ contentType: 'audio/mpeg', url: '/v1/objects/abc' })).toBe(true);
    expect(isAudioMedia({ local_file_mime: 'audio/wav' })).toBe(true);
    expect(isAudioMedia({ location: '/track.flac?token=123' })).toBe(true);
    expect(isAudioMedia(image)).toBe(false);
    expect(isAudioMedia(video)).toBe(false);
  });

  it('does not classify audio with an image thumbnail as image media', () => {
    expect(isImageMedia({ type: 'audio', thumbUrl: '/cover.png' })).toBe(false);
  });
});
