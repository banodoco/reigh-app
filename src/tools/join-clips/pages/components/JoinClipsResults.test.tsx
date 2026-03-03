import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JoinClipsResults } from './JoinClipsResults';

const mocks = vi.hoisted(() => ({
  MediaGallery: vi.fn(() => <div data-testid="media-gallery" />),
  SkeletonGallery: vi.fn(() => <div data-testid="skeleton-gallery" />),
}));

vi.mock('@/shared/components/MediaGallery', () => ({
  MediaGallery: (props: unknown) => mocks.MediaGallery(props),
}));

vi.mock('@/shared/components/ui/skeleton-gallery', () => ({
  SkeletonGallery: (props: unknown) => mocks.SkeletonGallery(props),
}));

describe('JoinClipsResults', () => {
  it('renders loading skeleton when fetching without valid items', () => {
    render(
      <JoinClipsResults
        videosData={undefined}
        videosLoading={true}
        videosFetching={false}
        projectAspectRatio="16:9"
        isMobile={false}
        deletingId={null}
        handleDeleteGeneration={vi.fn()}
        onToggleStar={vi.fn()}
      />,
    );

    expect(screen.getByText('Loading Results...')).toBeInTheDocument();
    expect(screen.getByTestId('skeleton-gallery')).toBeInTheDocument();
    expect(mocks.SkeletonGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 6,
        projectAspectRatio: '16:9',
      }),
    );
  });

  it('renders previous results gallery when items are available', () => {
    const handleDeleteGeneration = vi.fn();
    const onToggleStar = vi.fn();
    const data = {
      items: [
        { id: 'v1', type: 'video' },
        { id: 'v2', type: 'video' },
      ],
    } as never;

    render(
      <JoinClipsResults
        videosData={data}
        videosLoading={false}
        videosFetching={false}
        projectAspectRatio="16:9"
        isMobile={true}
        deletingId={'v2'}
        handleDeleteGeneration={handleDeleteGeneration}
        onToggleStar={onToggleStar}
      />,
    );

    expect(screen.getByText('Previous Results (2)')).toBeInTheDocument();
    expect(screen.getByTestId('media-gallery')).toBeInTheDocument();
    expect(mocks.MediaGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        images: data.items,
        isDeleting: 'v2',
        onDelete: handleDeleteGeneration,
        onToggleStar,
        itemsPerPage: 20,
      }),
    );
  });

  it('renders nothing when not loading and no items exist', () => {
    const { container } = render(
      <JoinClipsResults
        videosData={{ items: [] } as never}
        videosLoading={false}
        videosFetching={false}
        projectAspectRatio="16:9"
        isMobile={false}
        deletingId={null}
        handleDeleteGeneration={vi.fn()}
        onToggleStar={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
