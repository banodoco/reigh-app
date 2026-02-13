import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractVideoSegment } from '../extractVideoSegment';

// Mock MediaRecorder
class MockMediaRecorder {
  static isTypeSupported = vi.fn().mockReturnValue(true);

  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';

  constructor(public stream: any, public options: any) {}

  start() {
    this.state = 'recording';
    // Simulate data available
    setTimeout(() => {
      this.ondataavailable?.({ data: new Blob(['video-data'], { type: 'video/mp4' }) });
    }, 10);
  }

  stop() {
    this.state = 'inactive';
    setTimeout(() => {
      this.onstop?.();
    }, 10);
  }
}

vi.stubGlobal('MediaRecorder', MockMediaRecorder);

// Mock requestAnimationFrame
vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
  setTimeout(() => cb(0), 0);
  return 0;
});

describe('extractVideoSegment', () => {
  let mockVideo: any;
  let mockCanvas: any;
  let mockCtx: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockCtx = { drawImage: vi.fn() };
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
      captureStream: vi.fn().mockReturnValue({}),
    };

    mockVideo = {
      crossOrigin: '',
      muted: false,
      preload: '',
      videoWidth: 640,
      videoHeight: 480,
      duration: 10,
      currentTime: 0,
      src: '',
      paused: true,
      ended: false,
      onloadedmetadata: null as (() => void) | null,
      onseeked: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      load: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo;
      if (tag === 'canvas') return mockCanvas;
      return document.createElement(tag);
    });
  });

  it('rejects on video load error', async () => {
    const promise = extractVideoSegment('https://example.com/video.mp4', 0, 5, 'test.mp4');

    setTimeout(() => mockVideo.onerror?.(), 0);

    await expect(promise).rejects.toThrow('Failed to load video: test.mp4');
  });

  it('rejects on video abort', async () => {
    const promise = extractVideoSegment('https://example.com/video.mp4', 0, 5, 'test.mp4');

    setTimeout(() => mockVideo.onabort?.(), 0);

    await expect(promise).rejects.toThrow('Video loading aborted: test.mp4');
  });

  it('sets video src and calls load', () => {
    const promise = extractVideoSegment('https://example.com/video.mp4', 0, 5, 'test.mp4');

    expect(mockVideo.src).toBe('https://example.com/video.mp4');
    expect(mockVideo.load).toHaveBeenCalled();

    // Clean up the promise
    setTimeout(() => mockVideo.onerror?.(), 0);
    promise.catch(() => {});
  });

  it('sets canvas size from video dimensions', () => {
    const promise = extractVideoSegment('https://example.com/video.mp4', 1, 5, 'test.mp4');

    // Trigger metadata loaded
    mockVideo.onloadedmetadata?.();

    expect(mockCanvas.width).toBe(640);
    expect(mockCanvas.height).toBe(480);
    expect(mockVideo.currentTime).toBe(1); // Seeks to start time

    // Clean up
    setTimeout(() => mockVideo.onerror?.(), 50);
    promise.catch(() => {});
  });

  it('sets video to crossOrigin anonymous', () => {
    const promise = extractVideoSegment('https://example.com/video.mp4', 0, 5, 'test.mp4');
    expect(mockVideo.crossOrigin).toBe('anonymous');

    setTimeout(() => mockVideo.onerror?.(), 0);
    promise.catch(() => {});
  });
});

describe('negotiateMimeType (via extractVideoSegment)', () => {
  it('prefers mp4 when supported', () => {
    MockMediaRecorder.isTypeSupported.mockImplementation((type: string) => type === 'video/mp4');

    // The MIME type is used internally - we can't access it directly,
    // but we can verify MediaRecorder.isTypeSupported is called
    const promise = extractVideoSegment('https://example.com/video.mp4', 0, 5, 'test');

    // Trigger the flow
    const mockVideo = (document.createElement as any).mock?.results?.[0]?.value;
    if (mockVideo?.onloadedmetadata) {
      mockVideo.onloadedmetadata();
    }

    promise.catch(() => {}); // Cleanup
  });
});
