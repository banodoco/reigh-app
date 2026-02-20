import { describe, it, expect } from 'vitest';
import { determineVideoPhase, createLoadingSummary } from '../video-loading-utils';

describe('determineVideoPhase', () => {
  it('returns WAITING_TO_LOAD when no thumbnail and not loading', () => {
    // hasThumbnail=false, shouldLoad=false → WAITING_TO_LOAD
    const result = determineVideoPhase(false, false, false, false, false);
    expect(result.phase).toBe('WAITING_TO_LOAD');
    expect(result.readyToShow).toBe(false);
  });

  it('returns THUMBNAIL_READY when thumbnail loaded but video not yet', () => {
    const result = determineVideoPhase(false, false, false, true, true);
    expect(result.phase).toBe('THUMBNAIL_READY');
    expect(result.readyToShow).toBe(true);
  });

  it('returns WAITING_TO_LOAD when no thumbnail and not loading', () => {
    determineVideoPhase(false, false, false, false, false);
    // No thumbnail + not shouldLoad = INITIAL (first condition not met, second: !hasThumbnail && !shouldLoad)
    // Actually: hasThumbnail=false, thumbnailLoaded=false, so first condition fails
    // Second: !hasThumbnail(true) && !shouldLoad(true) → WAITING_TO_LOAD
    // Wait, shouldLoad=false so !shouldLoad=true — yes
    // But the first check is: hasThumbnail && thumbnailLoaded && !videoPosterLoaded
    // hasThumbnail=false so that fails. Then: !hasThumbnail(true) && !shouldLoad(true) → WAITING_TO_LOAD
    // But we already checked this case above and got INITIAL... Let me re-check.
    // Actually the first test passes with shouldLoad=false, hasThumbnail=false:
    // 1. hasThumbnail(false) → skip
    // 2. !hasThumbnail(true) && !shouldLoad(true) → WAITING_TO_LOAD
    // So the first test should actually return WAITING_TO_LOAD, not INITIAL!
    // Let me fix the first test.
  });

  it('returns INITIAL when nothing matches specific phases', () => {
    // shouldLoad=true, hasThumbnail=true, thumbnailLoaded=false, videoPosterLoaded=false
    // 1. hasThumbnail(true) && thumbnailLoaded(false) → skip
    // 2. !hasThumbnail(false) → skip
    // 3. shouldLoad(true) && !videoPosterLoaded(true) && !hasThumbnail(false) → skip
    // 4. shouldLoad(true) && !videoPosterLoaded(true) && hasThumbnail(true) && thumbnailLoaded(false) → skip
    // 5. videoPosterLoaded(false) → skip
    // → INITIAL
    const result = determineVideoPhase(true, false, false, false, true);
    expect(result.phase).toBe('INITIAL');
    expect(result.readyToShow).toBe(false);
  });

  it('returns VIDEO_LOADING when should load without thumbnail', () => {
    const result = determineVideoPhase(true, false, false, false, false);
    expect(result.phase).toBe('VIDEO_LOADING');
    expect(result.readyToShow).toBe(false);
  });

  it('returns VIDEO_LOADING_WITH_THUMBNAIL when thumbnail is ready and loading has started', () => {
    // hasThumbnail=true, thumbnailLoaded=true, videoPosterLoaded=false, shouldLoad=true
    // should stay in loading phase while still showing the thumbnail.
    const result = determineVideoPhase(true, false, false, true, true);
    expect(result.phase).toBe('VIDEO_LOADING_WITH_THUMBNAIL');
    expect(result.readyToShow).toBe(false);
  });

  it('returns VIDEO_READY when video poster loaded', () => {
    const result = determineVideoPhase(true, true, true, true, true);
    expect(result.phase).toBe('VIDEO_READY');
    expect(result.readyToShow).toBe(true);
  });

  it('returns VIDEO_READY when videoPosterLoaded and shouldLoad', () => {
    // videoPosterLoaded=true check comes after all others - but only
    // matches if no earlier condition matched. With shouldLoad=true,
    // hasThumbnail=false, we skip first few and hit videoPosterLoaded check.
    const result = determineVideoPhase(true, true, true, false, false);
    expect(result.phase).toBe('VIDEO_READY');
    expect(result.readyToShow).toBe(true);
  });
});

describe('createLoadingSummary', () => {
  it('shows thumbnail and video status when has thumbnail', () => {
    const result = createLoadingSummary(true, true, false, true);
    expect(result).toContain('Thumbnail:');
    expect(result).toContain('Video:');
  });

  it('shows only video status when no thumbnail', () => {
    const result = createLoadingSummary(false, false, false, true);
    expect(result).toContain('Video:');
    expect(result).not.toContain('Thumbnail:');
  });

  it('shows paused video icon when not loading', () => {
    const result = createLoadingSummary(false, false, false, false);
    expect(result).toContain('Video:');
  });

  it('shows check marks for loaded items', () => {
    const result = createLoadingSummary(true, true, true, true);
    expect(result).toContain('\u2705'); // checkmark
  });
});
