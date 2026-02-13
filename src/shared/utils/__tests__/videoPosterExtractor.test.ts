import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractVideoPosterFrame, extractVideoFinalFrame } from '../videoPosterExtractor';

// Mock DOM APIs
const mockCtx = {
  drawImage: vi.fn(),
};

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn().mockReturnValue(mockCtx),
  toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
    callback(new Blob(['frame-data'], { type: 'image/jpeg' }));
  }),
};

describe('extractVideoPosterFrame', () => {
  let mockVideo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVideo = {
      preload: '',
      muted: false,
      playsInline: false,
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 10,
      currentTime: 0,
      src: '',
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'loadedmetadata') {
          mockVideo._onLoadedMetadata = handler;
        } else if (event === 'seeked') {
          mockVideo._onSeeked = handler;
        } else if (event === 'error') {
          mockVideo._onError = handler;
        }
      }),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo;
      if (tag === 'canvas') return mockCanvas as any;
      return document.createElement(tag);
    });

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  it('extracts poster frame from video file', async () => {
    const file = new File(['video-data'], 'test.mp4', { type: 'video/mp4' });
    const promise = extractVideoPosterFrame(file);

    // Trigger metadata loaded
    mockVideo._onLoadedMetadata();
    // Trigger seeked
    mockVideo._onSeeked();

    const blob = await promise;
    expect(blob).toBeInstanceOf(Blob);
    expect(mockCtx.drawImage).toHaveBeenCalled();
  });

  it('sets canvas dimensions to match video', async () => {
    const file = new File(['video-data'], 'test.mp4', { type: 'video/mp4' });
    const promise = extractVideoPosterFrame(file);

    mockVideo._onLoadedMetadata();

    expect(mockCanvas.width).toBe(1920);
    expect(mockCanvas.height).toBe(1080);

    mockVideo._onSeeked();
    await promise;
  });

  it('seeks to 0.1 seconds for poster frame', async () => {
    const file = new File(['video-data'], 'test.mp4', { type: 'video/mp4' });
    const promise = extractVideoPosterFrame(file);

    mockVideo._onLoadedMetadata();
    expect(mockVideo.currentTime).toBe(0.1);

    mockVideo._onSeeked();
    await promise;
  });

  it('rejects when canvas context is null', async () => {
    mockCanvas.getContext.mockReturnValueOnce(null);

    const file = new File(['video-data'], 'test.mp4', { type: 'video/mp4' });
    await expect(extractVideoPosterFrame(file)).rejects.toThrow('Failed to get canvas context');
  });

  it('rejects on video error', async () => {
    const file = new File(['video-data'], 'test.mp4', { type: 'video/mp4' });
    const promise = extractVideoPosterFrame(file);

    mockVideo._onError();

    await expect(promise).rejects.toThrow('Failed to load video');
  });

  it('rejects when toBlob returns null', async () => {
    mockCanvas.toBlob.mockImplementationOnce((cb: any) => cb(null));

    const file = new File(['video-data'], 'test.mp4', { type: 'video/mp4' });
    const promise = extractVideoPosterFrame(file);

    mockVideo._onLoadedMetadata();
    mockVideo._onSeeked();

    await expect(promise).rejects.toThrow('Failed to create blob from canvas');
  });
});

describe('extractVideoFinalFrame', () => {
  let mockVideo: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVideo = {
      preload: '',
      muted: false,
      playsInline: false,
      videoWidth: 1280,
      videoHeight: 720,
      duration: 5,
      currentTime: 0,
      src: '',
      addEventListener: vi.fn((event: string, handler: any) => {
        if (event === 'loadedmetadata') {
          mockVideo._onLoadedMetadata = handler;
        } else if (event === 'seeked') {
          mockVideo._onSeeked = handler;
        } else if (event === 'error') {
          mockVideo._onError = handler;
        }
      }),
    };

    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return mockVideo;
      if (tag === 'canvas') return mockCanvas as any;
      return document.createElement(tag);
    });

    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-video');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  it('seeks to near the end of the video', async () => {
    const file = new File(['video-data'], 'test.mp4', { type: 'video/mp4' });
    const promise = extractVideoFinalFrame(file);

    mockVideo._onLoadedMetadata();
    // Should seek to duration - 0.1 = 4.9
    expect(mockVideo.currentTime).toBe(4.9);

    mockVideo._onSeeked();
    await promise;
  });

  it('handles very short videos', async () => {
    mockVideo.duration = 0.05;

    const file = new File(['video-data'], 'test.mp4', { type: 'video/mp4' });
    const promise = extractVideoFinalFrame(file);

    mockVideo._onLoadedMetadata();
    // max(0, 0.05 - 0.1) = 0
    expect(mockVideo.currentTime).toBe(0);

    mockVideo._onSeeked();
    await promise;
  });
});
