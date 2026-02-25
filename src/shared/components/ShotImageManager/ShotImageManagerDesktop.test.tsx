import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  prefetchTaskData: vi.fn(),
  navigateToShot: vi.fn(),
  isMobile: false,
}));

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: React.ReactNode) => node,
  };
});

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  closestCenter: vi.fn(),
}));

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <div data-testid="sortable-context">{children}</div>,
  rectSortingStrategy: vi.fn(),
}));

vi.mock('./components/ImageGrid', () => ({
  ImageGrid: () => <div data-testid="image-grid" />,
}));

vi.mock('./components/SelectionActionBar', () => ({
  SelectionActionBar: ({ onDeselect }: { onDeselect: () => void }) => (
    <div data-testid="selection-action-bar">
      <button data-testid="selection-deselect" onClick={onDeselect}>Deselect</button>
    </div>
  ),
}));

vi.mock('./components/DeleteConfirmationDialog', () => ({
  DeleteConfirmationDialog: () => <div data-testid="delete-confirm-dialog" />,
}));

vi.mock('../ImageDragPreview', () => ({
  MultiImagePreview: () => <div data-testid="multi-image-preview" />,
  SingleImagePreview: () => <div data-testid="single-image-preview" />,
}));

vi.mock('./components/BatchDropZone', () => ({
  default: ({ children }: { children: (isFileDragOver: boolean, dropTargetIndex: number | null) => React.ReactNode }) => (
    <div data-testid="batch-drop-zone">{children(false, null)}</div>
  ),
}));

vi.mock('../MediaLightbox', () => ({
  default: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="media-lightbox">
      <button data-testid="close-lightbox" onClick={onClose}>Close</button>
    </div>
  ),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => mocks.isMobile,
}));

vi.mock('./hooks/useTaskDetails', () => ({
  useTaskDetails: () => ({ taskDetailsData: {} }),
}));

vi.mock('@/shared/hooks/useShotNavigation', () => ({
  useShotNavigation: () => ({ navigateToShot: mocks.navigateToShot }),
}));

vi.mock('@/shared/hooks/useVideoScrubbing', () => ({
  useVideoScrubbing: () => ({
    containerProps: { onMouseEnter: vi.fn() },
    reset: vi.fn(),
    setVideoElement: vi.fn(),
    videoProps: {},
    scrubberPosition: null,
    scrubberVisible: false,
    duration: 0,
    currentTime: 0,
  }),
}));

vi.mock('@/shared/hooks/useTaskPrefetch', () => ({
  usePrefetchTaskData: () => mocks.prefetchTaskData,
}));

vi.mock('@/shared/hooks/usePendingImageOpen', () => ({
  usePendingImageOpen: () => ({ current: null }),
}));

vi.mock('./hooks/useAdjacentSegmentsData', () => ({
  useAdjacentSegmentsData: () => [],
}));

vi.mock('@/shared/lib/media/aspectRatios', () => ({
  getPreviewDimensions: () => ({ width: 200, height: 112 }),
}));

vi.mock('@/shared/lib/mediaUrl', () => ({
  getDisplayUrl: (url: string) => url,
}));

vi.mock('@/shared/lib/mediaTypeHelpers', () => ({
  getGenerationId: (image: { generation_id?: string; id?: string } | null) => image?.generation_id ?? image?.id ?? '',
}));

import { ShotImageManagerDesktop } from './ShotImageManagerDesktop';

describe('ShotImageManagerDesktop', () => {
  const baseImages = [
    { id: 'img-1', generation_id: 'gen-1', shotImageEntryId: 'entry-1', timeline_frame: 1 },
    { id: 'img-2', generation_id: 'gen-2', shotImageEntryId: 'entry-2', timeline_frame: 2 },
  ];

  const createProps = () => {
    const selection = {
      selectedIds: ['entry-1'],
      handleItemClick: vi.fn(),
      setSelectedIds: vi.fn(),
      setLastSelectedIndex: vi.fn(),
      lastSelectedIndex: null,
      showSelectionBar: true,
      clearSelection: vi.fn(),
    };

    const dragAndDrop = {
      sensors: [],
      handleDragStart: vi.fn(),
      handleDragEnd: vi.fn(),
      activeImage: null,
      activeId: 'entry-1',
    };

    const lightbox = {
      lightboxIndex: null as number | null,
      currentImages: [...baseImages],
      setLightboxIndex: vi.fn(),
      shouldAutoEnterInpaint: false,
      setShouldAutoEnterInpaint: vi.fn(),
      handleNext: vi.fn(),
      handlePrevious: vi.fn(),
    };

    const batchOps = {
      handleIndividualDelete: vi.fn(),
      imageDeletionSettings: {},
      updateImageDeletionSettings: vi.fn(),
      handleBatchDelete: vi.fn(),
      confirmOpen: false,
      setConfirmOpen: vi.fn(),
      pendingDeleteIds: [],
      performBatchDelete: vi.fn(),
    };

    const optimistic = {
      optimisticOrder: [] as string[],
    };

    const externalGens = {
      derivedNavContext: null,
      setDerivedNavContext: vi.fn(),
      setTempDerivedGenerations: vi.fn(),
      externalGenLightboxSelectedShot: 'shot-1',
      setExternalGenLightboxSelectedShot: vi.fn(),
      handleOpenExternalGeneration: vi.fn(),
      handleExternalGenAddToShot: vi.fn(),
      handleExternalGenAddToShotWithoutPosition: vi.fn(),
    };

    return {
      selection,
      dragAndDrop,
      lightbox,
      batchOps,
      optimistic,
      externalGens,
      getFramePosition: vi.fn(),
      setLightboxSelectedShotId: vi.fn(),
      images: [...baseImages],
      shotId: 'shot-1',
      selectedShotId: 'shot-1',
      allShots: [{ id: 'shot-1', name: 'Shot 1' }],
      onImageDelete: vi.fn(),
      onImageReorder: vi.fn(),
      onShotChange: vi.fn(),
      onAddToShot: vi.fn(),
      onAddToShotWithoutPosition: vi.fn(),
      onCreateShot: vi.fn(),
      onMagicEdit: vi.fn(),
      onFileDrop: vi.fn(),
      onGenerationDrop: vi.fn(),
      generationMode: 'batch',
      columns: 4,
      projectAspectRatio: '16:9',
    } as unknown as React.ComponentProps<typeof ShotImageManagerDesktop>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prefetchTaskData = vi.fn();
    mocks.navigateToShot = vi.fn();
    mocks.isMobile = false;
  });

  it('renders grid/selection UI in desktop mode', () => {
    const props = createProps();
    render(<ShotImageManagerDesktop {...props} />);

    expect(screen.getByTestId('batch-drop-zone')).toBeInTheDocument();
    expect(screen.getByTestId('dnd-context')).toBeInTheDocument();
    expect(screen.getByTestId('sortable-context')).toBeInTheDocument();
    expect(screen.getByTestId('image-grid')).toBeInTheDocument();
    expect(screen.getByTestId('selection-action-bar')).toBeInTheDocument();
    expect(screen.getByTestId('delete-confirm-dialog')).toBeInTheDocument();
  });

  it('closes lightbox and resets lightbox-related state', () => {
    const props = createProps();
    props.lightbox.lightboxIndex = 0;
    render(<ShotImageManagerDesktop {...props} />);

    fireEvent.click(screen.getByTestId('close-lightbox'));

    expect(props.lightbox.setLightboxIndex).toHaveBeenCalledWith(null);
    expect(props.lightbox.setShouldAutoEnterInpaint).toHaveBeenCalledWith(false);
    expect(props.externalGens.setDerivedNavContext).toHaveBeenCalledWith(null);
    expect(props.externalGens.setTempDerivedGenerations).toHaveBeenCalledWith([]);
    expect(props.setLightboxSelectedShotId).toHaveBeenCalledWith('shot-1');
  });

  it('prefetches current and adjacent task data when lightbox is open', async () => {
    const props = createProps();
    props.lightbox.lightboxIndex = 0;
    props.lightbox.currentImages = [...baseImages];

    render(<ShotImageManagerDesktop {...props} />);

    await waitFor(() => {
      expect(mocks.prefetchTaskData).toHaveBeenCalledWith('gen-1');
      expect(mocks.prefetchTaskData).toHaveBeenCalledWith('gen-2');
    });
  });
});
