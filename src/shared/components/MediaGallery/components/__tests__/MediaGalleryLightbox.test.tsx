import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { MediaGalleryLightbox } from '../MediaGalleryLightbox';
import type { GeneratedImageWithMetadata } from '../../types';

const mediaLightboxSpy = vi.fn();

vi.mock('@/shared/components/MediaLightbox/MediaLightbox', () => ({
  __esModule: true,
  default: (props: unknown) => {
    mediaLightboxSpy(props);
    return null;
  },
}));

vi.mock('@/shared/components/TaskDetailsModal', () => ({
  __esModule: true,
  default: () => null,
}));

vi.mock('../../hooks/useMediaGalleryLightboxControllers', () => ({
  useLightboxNavigationState: () => ({ hasNext: false, hasPrevious: false }),
  useShotAssociationState: () => ({
    positionedInSelectedShot: undefined,
    associatedWithoutPositionInSelectedShot: undefined,
  }),
  useGenerationNavigationController: () => ({
    handleNavigateToGeneration: vi.fn(),
    handleOpenExternalGeneration: vi.fn(),
  }),
  buildTaskDetailsPayload: () => ({ task: null, isLoading: false, status: 'missing', error: null, inputImages: [] }),
}));

function buildMedia(overrides: Partial<GeneratedImageWithMetadata>): GeneratedImageWithMetadata {
  return {
    id: 'gen-1',
    url: 'https://example.com/image.png',
    metadata: {},
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  } as GeneratedImageWithMetadata;
}

function renderLightbox({
  activeLightboxMedia,
  filteredImages,
}: {
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  filteredImages: GeneratedImageWithMetadata[];
}) {
  return render(
    <MediaGalleryLightbox
      session={{
        activeLightboxMedia,
        autoEnterEditMode: false,
        onClose: vi.fn(),
        filteredImages,
        isServerPagination: false,
        totalPages: 1,
        onNext: vi.fn(),
        onPrevious: vi.fn(),
        simplifiedShotOptions: [],
        selectedShotIdLocal: 'all',
        onShotChange: vi.fn(),
        showTickForImageId: null,
        setShowTickForImageId: vi.fn(),
        isMobile: false,
        showTaskDetailsModal: false,
        setShowTaskDetailsModal: vi.fn(),
        selectedImageForDetails: null,
        setSelectedImageForDetails: vi.fn(),
      }}
    />
  );
}

describe('MediaGalleryLightbox', () => {
  beforeEach(() => {
    mediaLightboxSpy.mockClear();
  });

  it('prefers current filtered image state for starred and strips internal metadata flag', () => {
    const active = buildMedia({
      id: 'gen-1',
      starred: false,
      metadata: { __autoEnterEditMode: true, source: 'active' } as GeneratedImageWithMetadata['metadata'],
    });
    const filtered = [
      buildMedia({
        id: 'gen-1',
        starred: true,
        metadata: { source: 'filtered' } as GeneratedImageWithMetadata['metadata'],
      }),
    ];

    renderLightbox({ activeLightboxMedia: active, filteredImages: filtered });

    const props = mediaLightboxSpy.mock.calls[0]?.[0] as { starred?: boolean; initialEditActive?: boolean; media?: GeneratedImageWithMetadata };
    expect(props.starred).toBe(true);
    expect(props.initialEditActive).toBe(true);
    expect(props.media?.metadata).toEqual({ source: 'filtered' });
  });

  it('falls back to active media when filtered image is unavailable', () => {
    const active = buildMedia({
      id: 'gen-fallback',
      starred: true,
      metadata: { __autoEnterEditMode: true, source: 'active-only' } as GeneratedImageWithMetadata['metadata'],
    });

    renderLightbox({ activeLightboxMedia: active, filteredImages: [] });

    const props = mediaLightboxSpy.mock.calls[0]?.[0] as { starred?: boolean; media?: GeneratedImageWithMetadata };
    expect(props.starred).toBe(true);
    expect(props.media?.metadata).toEqual({ source: 'active-only' });
  });
});
