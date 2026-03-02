import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all external dependencies
vi.mock('../styleReferenceProcessor', () => ({
  processStyleReferenceForAspectRatioString: vi.fn().mockResolvedValue('data:image/png;base64,processed'),
}));

vi.mock('../imageUploader', () => ({
  uploadImageToStorage: vi.fn().mockResolvedValue('https://storage.com/uploaded.jpg'),
}));

vi.mock('../../fileConversion', () => ({
  dataURLtoFile: vi.fn().mockReturnValue(new File(['test'], 'test.png', { type: 'image/png' })),
}));

vi.mock('@/shared/media/clientThumbnailGenerator', () => ({
  generateClientThumbnail: vi.fn().mockResolvedValue({
    thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }),
    thumbnailWidth: 150,
    thumbnailHeight: 100,
    originalWidth: 1920,
    originalHeight: 1080,
  }),
  uploadImageWithThumbnail: vi.fn().mockResolvedValue({
    imageUrl: 'https://storage.com/processed.jpg',
    thumbnailUrl: 'https://storage.com/thumb.jpg',
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
      }),
    },
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

// Mock FileReader
class MockFileReader {
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;

  readAsDataURL() {
    this.result = 'data:image/png;base64,original';
    setTimeout(() => this.onloadend?.(), 0);
  }
}
vi.stubGlobal('FileReader', MockFileReader);

import { recropAllReferences, type RecropReferenceInput } from '../recropReferences';

describe('recropAllReferences', () => {
  const makeRef = (overrides: Partial<RecropReferenceInput> = {}): RecropReferenceInput => ({
    id: 'ref-1',
    name: 'Test Reference',
    styleReferenceImage: 'https://storage.com/cropped.jpg',
    styleReferenceImageOriginal: 'https://storage.com/original.jpg',
    styleReferenceStrength: 0.5,
    subjectStrength: 0.5,
    subjectDescription: '',
    inThisScene: false,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(['image-data'], { type: 'image/png' })),
    });
  });

  it('returns empty array for empty input', async () => {
    const result = await recropAllReferences([], '16:9');
    expect(result).toEqual([]);
  });

  it('skips references without original image', async () => {
    const ref = makeRef({ styleReferenceImageOriginal: null });
    const onProgress = vi.fn();

    const result = await recropAllReferences([ref], '16:9', onProgress);

    expect(result).toHaveLength(1);
    expect(result[0]).toBe(ref); // Original reference passed through unchanged
    expect(onProgress).toHaveBeenCalledWith(1, 1);
  });

  it('reprocesses references with original image', async () => {
    const ref = makeRef();
    const result = await recropAllReferences([ref], '16:9');

    expect(result).toHaveLength(1);
    expect(result[0].styleReferenceImage).toBe('https://storage.com/processed.jpg');
    expect(result[0].thumbnailUrl).toBe('https://storage.com/thumb.jpg');
    expect(result[0].styleReferenceImageOriginal).toBe('https://storage.com/original.jpg'); // Preserved
  });

  it('calls progress callback correctly', async () => {
    const refs = [makeRef({ id: 'ref-1' }), makeRef({ id: 'ref-2' })];
    const onProgress = vi.fn();

    await recropAllReferences(refs, '1:1', onProgress);

    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });

  it('keeps original reference on fetch error', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    const ref = makeRef();
    const result = await recropAllReferences([ref], '16:9');

    expect(result).toHaveLength(1);
    // Should fall back to original reference
    expect(result[0].id).toBe(ref.id);
  });

  it('updates the updatedAt timestamp', async () => {
    const ref = makeRef({ updatedAt: '2024-01-01T00:00:00Z' });
    const result = await recropAllReferences([ref], '16:9');

    expect(new Date(result[0].updatedAt).getTime()).toBeGreaterThan(
      new Date('2024-01-01T00:00:00Z').getTime()
    );
  });
});
