import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/lib/settingsMigration', () => ({
  readSegmentOverrides: vi.fn(() => ({})),
}));

vi.mock('@/shared/lib/media/downloadMedia', () => ({
  downloadMedia: vi.fn(),
}));

import { handleLightboxDownload } from '../lightboxDownload';
import { downloadMedia } from '@/shared/lib/media/downloadMedia';
import { readSegmentOverrides } from '@/shared/lib/settingsMigration';
import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';
import type { GenerationRow } from '@/domains/generation/types';

const mockDownloadMedia = vi.mocked(downloadMedia);
const mockReadSegmentOverrides = vi.mocked(readSegmentOverrides);

describe('handleLightboxDownload', () => {
  const mockSetIsDownloading = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockReadSegmentOverrides.mockReturnValue({});
  });

  const makeMedia = (overrides: Partial<GenerationRow> = {}): GenerationRow => ({
    id: 'media-123',
    params: { prompt: 'a beautiful sunset' },
    metadata: undefined,
    contentType: 'image/png',
    ...overrides,
  });

  const makeVariant = (id: string, location: string): GenerationVariant => ({
    id,
    location,
    generation_id: 'gen-1',
    created_at: '2025-01-01',
  } as GenerationVariant);

  it('downloads with variant URL when intendedVariantId matches', async () => {
    const variants = [makeVariant('v1', 'https://example.com/variant.png')];
    const media = makeMedia();

    await handleLightboxDownload({
      intendedVariantId: 'v1',
      variants,
      fallbackUrl: 'https://example.com/fallback.png',
      media,
      isVideo: false,
      setIsDownloading: mockSetIsDownloading,
    });

    expect(mockDownloadMedia).toHaveBeenCalledWith(
      'https://example.com/variant.png',
      'media-123',
      false,
      'image/png',
      'a beautiful sunset',
    );
  });

  it('falls back to fallbackUrl when variant not found', async () => {
    const media = makeMedia();

    await handleLightboxDownload({
      intendedVariantId: 'nonexistent',
      variants: [],
      fallbackUrl: 'https://example.com/fallback.png',
      media,
      isVideo: false,
      setIsDownloading: mockSetIsDownloading,
    });

    expect(mockDownloadMedia).toHaveBeenCalledWith(
      'https://example.com/fallback.png',
      'media-123',
      false,
      'image/png',
      'a beautiful sunset',
    );
  });

  it('falls back to fallbackUrl when intendedVariantId is null', async () => {
    const media = makeMedia();

    await handleLightboxDownload({
      intendedVariantId: null,
      variants: [makeVariant('v1', 'https://example.com/variant.png')],
      fallbackUrl: 'https://example.com/fallback.png',
      media,
      isVideo: false,
      setIsDownloading: mockSetIsDownloading,
    });

    expect(mockDownloadMedia).toHaveBeenCalledWith(
      'https://example.com/fallback.png',
      expect.any(String),
      false,
      expect.any(String),
      expect.any(String),
    );
  });

  it('does nothing when no URL is available', async () => {
    const media = makeMedia();

    await handleLightboxDownload({
      intendedVariantId: null,
      variants: [],
      fallbackUrl: '',
      media,
      isVideo: false,
      setIsDownloading: mockSetIsDownloading,
    });

    expect(mockDownloadMedia).not.toHaveBeenCalled();
    expect(mockSetIsDownloading).not.toHaveBeenCalled();
  });

  it('sets isDownloading to true then false', async () => {
    const media = makeMedia();

    await handleLightboxDownload({
      intendedVariantId: null,
      variants: [],
      fallbackUrl: 'https://example.com/img.png',
      media,
      isVideo: false,
      setIsDownloading: mockSetIsDownloading,
    });

    expect(mockSetIsDownloading).toHaveBeenCalledWith(true);
    expect(mockSetIsDownloading).toHaveBeenCalledWith(false);
  });

  it('sets isDownloading to false even when download throws', async () => {
    mockDownloadMedia.mockRejectedValueOnce(new Error('download failed'));
    const media = makeMedia();

    await expect(
      handleLightboxDownload({
        intendedVariantId: null,
        variants: [],
        fallbackUrl: 'https://example.com/img.png',
        media,
        isVideo: false,
        setIsDownloading: mockSetIsDownloading,
      })
    ).rejects.toThrow('download failed');

    expect(mockSetIsDownloading).toHaveBeenCalledWith(false);
  });

  it('extracts prompt from metadata.enhanced_prompt', async () => {
    const media = makeMedia({
      params: {},
      metadata: { enhanced_prompt: 'enhanced version' },
    });

    await handleLightboxDownload({
      intendedVariantId: null,
      variants: [],
      fallbackUrl: 'https://example.com/img.png',
      media,
      isVideo: false,
      setIsDownloading: mockSetIsDownloading,
    });

    expect(mockDownloadMedia).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      false,
      expect.any(String),
      'enhanced version',
    );
  });

  it('passes isVideo flag through to downloadMedia', async () => {
    const media = makeMedia({ contentType: 'video/mp4' });

    await handleLightboxDownload({
      intendedVariantId: null,
      variants: [],
      fallbackUrl: 'https://example.com/video.mp4',
      media,
      isVideo: true,
      setIsDownloading: mockSetIsDownloading,
    });

    expect(mockDownloadMedia).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      true,
      'video/mp4',
      expect.any(String),
    );
  });
});
