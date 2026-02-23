import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';

const mocks = vi.hoisted(() => ({
  location: { pathname: '/home' },
  navigate: vi.fn(),
  invalidateQueries: vi.fn(),
  closePane: vi.fn(),
  openPane: vi.fn(),
  toggleLock: vi.fn(),
  setIsGenerationsPaneLocked: vi.fn(),
  setIsGenerationsPaneOpen: vi.fn(),
  createShot: vi.fn(),
  galleryContainerRef: vi.fn(),
  slidingPaneState: {} as Record<string, unknown>,
  panesState: {} as Record<string, unknown>,
  galleryState: {} as Record<string, unknown>,
}));

vi.mock('@/shared/hooks/useRenderLogger', () => ({
  useRenderLogger: vi.fn(),
}));

vi.mock('@/shared/hooks/useSlidingPane', () => ({
  useSlidingPane: () => mocks.slidingPaneState,
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mocks.invalidateQueries,
  }),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.navigate,
  useLocation: () => mocks.location,
}));

vi.mock('@/shared/lib/toolConstants', () => ({
  TOOL_ROUTES: {
    IMAGE_GENERATION: '/image-generation',
  },
}));

vi.mock('@/shared/components/MediaGallery', () => ({
  MediaGallery: ({ images }: { images: unknown[] }) => (
    <div data-testid="media-gallery">items:{images.length}</div>
  ),
}));

vi.mock('@/shared/components/MediaGallery/hooks', () => ({
  useContainerWidth: () => [mocks.galleryContainerRef, 1200] as const,
}));

vi.mock('@/shared/components/MediaGallery/utils', () => ({
  calculateGalleryLayout: () => ({
    columns: 4,
    itemsPerPage: 36,
  }),
}));

vi.mock('@/shared/contexts/PanesContext', () => ({
  usePanes: () => mocks.panesState,
}));

vi.mock('@/shared/hooks/useGalleryPageState', () => ({
  useGalleryPageState: () => mocks.galleryState,
}));

vi.mock('@/shared/hooks/useMobile', () => ({
  useIsMobile: () => false,
}));

vi.mock('@/shared/contexts/CurrentShotContext', () => ({
  useCurrentShot: () => ({ currentShotId: 'shot-1' }),
}));

vi.mock('@/shared/contexts/ShotsContext', () => ({
  useShots: () => ({ shots: [{ id: 'shot-1', name: 'Shot 1' }] }),
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProject: () => ({
    selectedProjectId: 'project-1',
    projects: [{ id: 'project-1', aspectRatio: '16:9' }],
  }),
}));

vi.mock('@/shared/hooks/useShotCreation', () => ({
  useShotCreation: () => ({ createShot: mocks.createShot }),
}));

vi.mock('@/shared/hooks/useStableObject', () => ({
  useStableObject: (build: () => unknown) => build(),
}));

vi.mock('../PaneControlTab', () => ({
  default: () => <div data-testid="pane-tab" />,
}));

vi.mock('@/shared/components/ui/skeleton-gallery', () => ({
  SkeletonGallery: () => <div data-testid="skeleton-gallery" />,
}));

vi.mock('@/shared/components/ShotFilter', () => ({
  ShotFilter: () => <div data-testid="shot-filter" />,
}));

vi.mock('@/shared/components/MediaTypeFilter', () => ({
  MediaTypeFilter: () => <div data-testid="media-type-filter" />,
}));

vi.mock('@/shared/components/ImageGenerationModal', () => ({
  ImageGenerationModal: ({ isOpen }: { isOpen: boolean }) => (
    <div data-testid="generation-modal">{isOpen ? 'open' : 'closed'}</div>
  ),
}));

vi.mock('@/shared/constants/filterConstants', () => ({
  SHOT_FILTER: {
    ALL: 'all',
  },
  isSpecialFilter: (value: string) => value === 'all',
}));

vi.mock('@/shared/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`select-item-${value}`}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  SelectValue: ({ children }: { children?: React.ReactNode }) => <span>{children}</span>,
}));

import { GenerationsPane } from './GenerationsPane';

describe('GenerationsPane', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.location.pathname = '/home';

    mocks.panesState = {
      isGenerationsPaneLocked: false,
      setIsGenerationsPaneLocked: mocks.setIsGenerationsPaneLocked,
      isGenerationsPaneOpen: true,
      setIsGenerationsPaneOpen: mocks.setIsGenerationsPaneOpen,
      generationsPaneHeight: 320,
      isShotsPaneLocked: false,
      shotsPaneWidth: 320,
      isTasksPaneLocked: false,
      tasksPaneWidth: 320,
    };

    mocks.slidingPaneState = {
      isLocked: false,
      isOpen: true,
      toggleLock: mocks.toggleLock,
      openPane: mocks.openPane,
      paneProps: {},
      transformClass: '',
      handlePaneEnter: vi.fn(),
      handlePaneLeave: vi.fn(),
      showBackdrop: false,
      closePane: mocks.closePane,
    };

    mocks.galleryState = {
      shotsData: [{ id: 'shot-1', name: 'Shot 1' }],
      paginatedData: { items: [] },
      lastAffectedShotId: null,
      totalCount: 0,
      selectedShotFilter: 'all',
      excludePositioned: false,
      page: 1,
      isLoading: false,
      error: null,
      isDeleting: false,
      starredOnly: false,
      searchTerm: '',
      setSelectedShotFilter: vi.fn(),
      setExcludePositioned: vi.fn(),
      setStarredOnly: vi.fn(),
      setSearchTerm: vi.fn(),
      handleServerPageChange: vi.fn(),
      handleDeleteGeneration: vi.fn(),
      handleAddToShot: vi.fn(),
      handleAddToShotWithoutPosition: vi.fn(),
      expectedItemCount: 8,
      DeleteConfirmDialog: () => <div data-testid="delete-confirm-dialog" />,
    };
  });

  it('renders empty state and toggles starred filter', () => {
    render(<GenerationsPane />);

    expect(screen.getByText('No generations found for this project.')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Show only starred items'));
    expect(mocks.galleryState.setStarredOnly).toHaveBeenCalledWith(true);
  });

  it('shows skeleton gallery during initial loading', () => {
    mocks.galleryState.isLoading = true;
    mocks.galleryState.paginatedData = { items: [] };

    render(<GenerationsPane />);
    expect(screen.getByTestId('skeleton-gallery')).toBeInTheDocument();
  });

  it('opens and closes generation modal from window events', async () => {
    render(<GenerationsPane />);
    expect(screen.getByTestId('generation-modal')).toHaveTextContent('closed');

    act(() => {
      dispatchAppEvent('openGenerationModal');
    });
    await waitFor(() => {
      expect(screen.getByTestId('generation-modal')).toHaveTextContent('open');
    });

    act(() => {
      dispatchAppEvent('closeGenerationModal');
    });
    await waitFor(() => {
      expect(screen.getByTestId('generation-modal')).toHaveTextContent('closed');
    });
  });

  it('closes pane when backdrop receives pointer down', () => {
    mocks.slidingPaneState.showBackdrop = true;

    render(<GenerationsPane />);
    const backdrop = document.querySelector('div[aria-hidden="true"]');
    expect(backdrop).not.toBeNull();

    fireEvent.pointerDown(backdrop as HTMLElement);
    expect(mocks.closePane).toHaveBeenCalledTimes(1);
  });

  it('hides pane control tab on image generation route', () => {
    mocks.location.pathname = '/image-generation';

    render(<GenerationsPane />);
    expect(screen.queryByTestId('pane-tab')).toBeNull();
  });
});
