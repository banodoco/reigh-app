import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      }),
    },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://storage.com/thumb.jpg' },
        }),
      }),
    },
    from: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ error: null }),
  };
  return { mockSupabase };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

vi.mock('@/shared/lib/mediaUrl', () => ({
  getDisplayUrl: (url: string) => url,
}));

vi.mock('@/shared/lib/storagePaths', () => ({
  storagePaths: {
    thumbnail: vi.fn().mockReturnValue('thumbnails/user-123/gen-1-thumb.jpg'),
  },
  MEDIA_BUCKET: 'media',
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

import {
  generateAndUploadThumbnail,
  extractAndUploadThumbnailOnly,
} from '../../lib/media/videoThumbnailGenerator';

// Mock video and canvas for thumbnail extraction
const mockCtx = {
  drawImage: vi.fn(),
};

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn().mockReturnValue(mockCtx),
  toBlob: vi.fn((callback: (blob: Blob | null) => void) => {
    callback(new Blob(['thumb-data'], { type: 'image/jpeg' }));
  }),
};

let mockVideo: unknown;

beforeEach(() => {
  vi.clearAllMocks();

  mockVideo = {
    crossOrigin: '',
    preload: '',
    muted: false,
    playsInline: false,
    videoWidth: 1920,
    videoHeight: 1080,
    duration: 10,
    currentTime: 0,
    src: '',
    remove: vi.fn(),
    addEventListener: vi.fn((event: string, handler: unknown) => {
      if (event === 'loadedmetadata') mockVideo._onLoadedMetadata = handler;
      else if (event === 'seeked') mockVideo._onSeeked = handler;
      else if (event === 'error') mockVideo._onError = handler;
    }),
  };

  vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    if (tag === 'video') return mockVideo;
    if (tag === 'canvas') return mockCanvas as unknown;
    return document.createElement(tag);
  });

  mockSupabase.from.mockReturnThis();
  mockSupabase.update.mockReturnThis();
  mockSupabase.eq.mockResolvedValue({ error: null });
});

describe('generateAndUploadThumbnail', () => {
  it('extracts thumbnail, uploads, and updates database', async () => {
    const resultPromise = generateAndUploadThumbnail(
      'https://example.com/video.mp4',
      'gen-1',
      'project-1'
    );

    // Simulate video loading
    setTimeout(() => {
      mockVideo._onLoadedMetadata();
      mockVideo._onSeeked();
    }, 0);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.thumbnailUrl).toBe('https://storage.com/thumb.jpg');
  });

  it('returns failure on video load error', async () => {
    const resultPromise = generateAndUploadThumbnail(
      'https://example.com/video.mp4',
      'gen-1',
      'project-1'
    );

    setTimeout(() => {
      mockVideo.error = { message: 'Load failed' };
      mockVideo._onError();
    }, 0);

    const result = await resultPromise;

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns failure when user not authenticated', async () => {
    mockSupabase.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
    });

    const resultPromise = generateAndUploadThumbnail(
      'https://example.com/video.mp4',
      'gen-1',
      'project-1'
    );

    setTimeout(() => {
      mockVideo._onLoadedMetadata();
      mockVideo._onSeeked();
    }, 0);

    const result = await resultPromise;
    expect(result.success).toBe(false);
    expect(result.error).toContain('not authenticated');
  });
});

describe('extractAndUploadThumbnailOnly', () => {
  it('extracts and uploads without DB update', async () => {
    const resultPromise = extractAndUploadThumbnailOnly(
      'https://example.com/video.mp4',
      'unique-id-1',
      'project-1'
    );

    setTimeout(() => {
      mockVideo._onLoadedMetadata();
      mockVideo._onSeeked();
    }, 0);

    const result = await resultPromise;

    expect(result.success).toBe(true);
    expect(result.thumbnailUrl).toBe('https://storage.com/thumb.jpg');
    // Should NOT call the generations table update
    expect(mockSupabase.update).not.toHaveBeenCalled();
  });

  it('returns failure on error', async () => {
    const resultPromise = extractAndUploadThumbnailOnly(
      'https://example.com/video.mp4',
      'unique-id-1',
      'project-1'
    );

    setTimeout(() => {
      mockVideo._onError();
    }, 0);

    const result = await resultPromise;
    expect(result.success).toBe(false);
  });
});
