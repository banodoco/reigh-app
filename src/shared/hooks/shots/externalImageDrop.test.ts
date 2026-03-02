import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  toastError: vi.fn(),
  normalizeAndPresentError: vi.fn(),
  uploadImageToStorage: vi.fn(),
  generateClientThumbnail: vi.fn(),
  uploadImageWithThumbnail: vi.fn(),
  cropImageToProjectAspectRatio: vi.fn(),
  parseRatio: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: mocks.from,
  }),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: mocks.toastError,
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

vi.mock('@/shared/lib/media/imageUploader', () => ({
  uploadImageToStorage: mocks.uploadImageToStorage,
}));

vi.mock('@/shared/media/clientThumbnailGenerator', () => ({
  generateClientThumbnail: mocks.generateClientThumbnail,
  uploadImageWithThumbnail: mocks.uploadImageWithThumbnail,
}));

vi.mock('@/shared/lib/media/imageCropper', () => ({
  cropImageToProjectAspectRatio: mocks.cropImageToProjectAspectRatio,
}));

vi.mock('@/shared/lib/media/aspectRatios', () => ({
  parseRatio: mocks.parseRatio,
}));

import { processDroppedImages } from './externalImageDrop';

function createQueryResult(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data }),
    insert: vi.fn().mockReturnThis(),
  };
}

describe('processDroppedImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseRatio.mockReturnValue(16 / 9);
    mocks.cropImageToProjectAspectRatio.mockResolvedValue(null);
    mocks.generateClientThumbnail.mockResolvedValue({
      thumbnailBlob: new Blob(['thumb'], { type: 'image/jpeg' }),
    });
    mocks.uploadImageWithThumbnail.mockResolvedValue({
      imageUrl: 'https://example.com/image.png',
      thumbnailUrl: 'https://example.com/thumb.png',
    });
    mocks.uploadImageToStorage.mockResolvedValue('https://example.com/image.png');
    mocks.from.mockImplementation((table: string) => {
      if (table === 'projects') {
        return createQueryResult({ aspect_ratio: null, settings: null });
      }
      if (table === 'shots') {
        return createQueryResult({ aspect_ratio: null });
      }
      return createQueryResult(null);
    });
  });

  it('returns null when shot creation fails for missing target shot', async () => {
    const result = await processDroppedImages({
      variables: {
        imageFiles: [new File(['img'], 'one.png', { type: 'image/png' })],
        targetShotId: null,
        currentProjectQueryKey: 'project-1',
        currentShotCount: 2,
      },
      projectId: 'project-1',
      createShot: vi.fn().mockResolvedValue(null),
      addImageToShot: vi.fn(),
      addImageToShotWithoutPosition: vi.fn(),
    });

    expect(result).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith('Failed to create new shot.');
  });

  it('uploads, creates generation, and attaches with explicit timeline position', async () => {
    const addImageToShot = vi.fn().mockResolvedValue(undefined);
    const addImageToShotWithoutPosition = vi.fn().mockResolvedValue(undefined);

    const result = await processDroppedImages({
      variables: {
        imageFiles: [new File(['img'], 'frame.png', { type: 'image/png' })],
        targetShotId: 'shot-1',
        currentProjectQueryKey: 'project-1',
        currentShotCount: 1,
        positions: [42],
      },
      projectId: 'project-1',
      createShot: vi.fn(),
      addImageToShot,
      addImageToShotWithoutPosition,
      createGeneration: vi.fn().mockResolvedValue({
        id: 'gen-1',
        location: 'https://example.com/image.png',
      }),
    });

    expect(result).toEqual({
      shotId: 'shot-1',
      generationIds: ['gen-1'],
    });
    expect(addImageToShot).toHaveBeenCalledWith(
      expect.objectContaining({
        shot_id: 'shot-1',
        generation_id: 'gen-1',
        timelineFrame: 42,
      }),
    );
    expect(addImageToShotWithoutPosition).not.toHaveBeenCalled();
  });
});
