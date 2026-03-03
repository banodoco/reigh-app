import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { VideoTravelVideosGallery } from './VideoTravelVideosGallery';
import { TOOL_IDS } from '@/shared/lib/toolIds';

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

describe('VideoTravelVideosGallery', () => {
  function buildProps(overrides: Partial<React.ComponentProps<typeof VideoTravelVideosGallery>> = {}) {
    return {
      query: {
        videosData: { items: [{ id: 'v1' }], total: 1 },
        videosLoading: false,
        videosFetching: false,
        selectedProjectId: 'project-1',
        projectAspectRatio: '16:9',
        itemsPerPage: 12,
        columnsPerRow: 4,
        shots: [{ id: 'shot-1', name: 'Shot 1' }],
      },
      filters: {
        videoFilters: { mediaType: 'video' } as never,
        setVideoFilters: vi.fn(),
        videoPage: 2,
        setVideoPage: vi.fn(),
      },
      addToShot: {
        targetShotIdForButton: 'shot-1',
        targetShotNameForButtonTooltip: 'Shot 1',
        handleAddVideoToTargetShot: vi.fn(async () => true),
        handleAddVideoToTargetShotWithoutPosition: vi.fn(async () => true),
      },
      deletion: {
        onDelete: vi.fn(),
        isDeleting: false,
      },
      preloading: {
        enableAdjacentPagePreloading: false,
        generationFilters: { starredOnly: true },
      },
      onToggleStar: vi.fn(),
      videosViewJustEnabled: false,
      ...overrides,
    } as React.ComponentProps<typeof VideoTravelVideosGallery>;
  }

  it('renders skeleton when project is not selected or view just switched', () => {
    render(
      <VideoTravelVideosGallery
        {...buildProps({
          query: {
            ...buildProps().query,
            selectedProjectId: null,
            videosData: { items: [], total: 9 },
          },
          videosViewJustEnabled: true,
        })}
      />,
    );

    expect(screen.getByTestId('skeleton-gallery')).toBeInTheDocument();
    expect(mocks.SkeletonGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        count: 9,
        showControls: true,
        projectAspectRatio: '16:9',
      }),
    );
  });

  it('renders skeleton during loading when no valid data exists', () => {
    render(
      <VideoTravelVideosGallery
        {...buildProps({
          query: {
            ...buildProps().query,
            videosLoading: true,
            videosData: { items: [], total: 0 },
          },
        })}
      />,
    );

    expect(screen.getByTestId('skeleton-gallery')).toBeInTheDocument();
    expect(screen.queryByTestId('media-gallery')).toBeNull();
  });

  it('renders media gallery with wired add-to-shot, pagination, and filter props', () => {
    const props = buildProps();
    render(<VideoTravelVideosGallery {...props} />);

    expect(screen.getByTestId('media-gallery')).toBeInTheDocument();
    expect(mocks.MediaGallery).toHaveBeenCalledWith(
      expect.objectContaining({
        images: [{ id: 'v1' }],
        currentToolType: TOOL_IDS.TRAVEL_BETWEEN_IMAGES,
        serverPage: 2,
        itemsPerPage: 12,
        filters: props.filters.videoFilters,
        onFiltersChange: props.filters.setVideoFilters,
        lastShotId: 'shot-1',
        lastShotNameForTooltip: 'Shot 1',
        generationFilters: { starredOnly: true },
        enableAdjacentPagePreloading: false,
      }),
    );
  });
});
