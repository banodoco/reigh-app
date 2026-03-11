import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { GenerationsPaneGallery } from './GenerationsPaneGallery';

const mocks = vi.hoisted(() => ({
  MediaGallery: vi.fn(() => <div data-testid="media-gallery" />),
  SkeletonGallery: vi.fn(() => <div data-testid="skeleton-gallery" />),
}));

vi.mock('@/features/gallery/components/MediaGallery', () => ({
  MediaGallery: (props: unknown) => mocks.MediaGallery(props),
}));

vi.mock('@/shared/components/ui/skeleton-gallery', () => ({
  SkeletonGallery: (props: unknown) => mocks.SkeletonGallery(props),
}));

function buildProps(overrides: Partial<ComponentProps<typeof GenerationsPaneGallery>> = {}) {
  return {
    containerRef: { current: null },
    projectAspectRatio: '16:9',
    layout: { columns: 3, itemsPerPage: 12 },
    loading: { isLoading: false, expectedItemCount: 12 },
    pagination: { page: 2, totalCount: 25 },
    error: null,
    gallery: {
      items: [],
      onDelete: vi.fn(),
      onToggleStar: vi.fn(),
      isDeleting: false,
      allShots: [],
      lastShotId: undefined,
      filters: { sortBy: 'newest' } as never,
      onFiltersChange: vi.fn(),
      onAddToShot: vi.fn(async () => false),
      onAddToShotWithoutPosition: vi.fn(async () => false),
      onServerPageChange: vi.fn(),
      generationFilters: undefined,
      currentViewingShotId: undefined,
      onCreateShot: vi.fn(async () => undefined),
    },
    ...overrides,
  };
}

describe('GenerationsPaneGallery', () => {
  it('renders loading skeleton when loading and no items exist', () => {
    render(
      <GenerationsPaneGallery
        {...buildProps({
          loading: { isLoading: true, expectedItemCount: 9 },
        })}
      />,
    );

    expect(screen.getByTestId('skeleton-gallery')).toBeInTheDocument();
    expect(mocks.SkeletonGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 9,
        fixedColumns: 3,
        projectAspectRatio: '16:9',
      }),
    );
  });

  it('renders media gallery with mapped pagination props when items are present', () => {
    const gallery = buildProps().gallery;
    const items = [{ id: 'g1' }, { id: 'g2' }];
    render(
      <GenerationsPaneGallery
        {...buildProps({
          gallery: { ...gallery, items } as never,
        })}
      />,
    );

    expect(screen.getByTestId('media-gallery')).toBeInTheDocument();
    expect(mocks.MediaGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        images: items,
        pagination: expect.objectContaining({
          offset: 12,
          totalCount: 25,
          itemsPerPage: 12,
        }),
      }),
    );
  });

  it('renders error and empty states when applicable', () => {
    render(
      <GenerationsPaneGallery
        {...buildProps({
          error: new Error('failed'),
          loading: { isLoading: false },
        })}
      />,
    );

    expect(screen.getByText('Error: failed')).toBeInTheDocument();
    expect(screen.getByText('No generations found for this project.')).toBeInTheDocument();
  });
});
