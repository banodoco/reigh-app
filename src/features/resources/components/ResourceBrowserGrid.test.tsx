import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceBrowserGrid } from './ResourceBrowserGrid';
import type { ResourceBrowserData } from '@/shared/hooks/resources/useResourceBrowserData';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/shared/components/HoverScrubVideo', () => ({
  default: ({ src, onLoadedData }: { src: string; onLoadedData?: () => void }) => (
    <button data-testid={`video-${src}`} onClick={onLoadedData}>
      video
    </button>
  ),
}));

vi.mock('lucide-react', () => ({
  Image: () => <span data-testid="icon-image" />,
  Loader2: () => <span data-testid="icon-loader" />,
  Lock: () => <span data-testid="icon-lock" />,
  Globe: () => <span data-testid="icon-globe" />,
  Video: () => <span data-testid="icon-video" />,
}));

function buildBrowsing(overrides: Partial<ResourceBrowserData> = {}): ResourceBrowserData {
  return {
    isVideoMode: false,
    userId: 'user-1',
    searchTerm: '',
    currentPage: 1,
    processingResource: null,
    isThumbnailLoaded: () => true,
    markThumbnailLoaded: vi.fn(),
    showMyResourcesOnly: false,
    toggleMyResourcesFilter: vi.fn(),
    clearMyResourcesFilter: vi.fn(),
    filteredResources: [],
    paginatedResources: [],
    totalPages: 1,
    loading: false,
    handleSearch: vi.fn(),
    handlePageChange: vi.fn(),
    handleToggleVisibility: vi.fn(async () => undefined),
    handleResourceClick: vi.fn(async () => undefined),
    clearSearch: vi.fn(),
    ...overrides,
  };
}

describe('ResourceBrowserGrid', () => {
  it('shows loading skeleton tiles when loading', () => {
    const { container } = render(
      <ResourceBrowserGrid
        browsing={buildBrowsing({ loading: true })}
        resourceLabelPlural="references"
      />,
    );

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(16);
  });

  it('renders empty state with clear actions for search/my-resources filters', () => {
    const clearSearch = vi.fn();
    const clearMyResourcesFilter = vi.fn();

    render(
      <ResourceBrowserGrid
        browsing={buildBrowsing({
          searchTerm: 'cat',
          showMyResourcesOnly: true,
          filteredResources: [],
          paginatedResources: [],
          clearSearch,
          clearMyResourcesFilter,
        })}
        resourceLabelPlural="references"
      />,
    );

    expect(screen.getByText("You don't have any references yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear search to see all references/i }));
    fireEvent.click(screen.getByRole('button', { name: /show all references/i }));
    expect(clearSearch).toHaveBeenCalledTimes(1);
    expect(clearMyResourcesFilter).toHaveBeenCalledTimes(1);
  });

  it('renders image resources and delegates click handling', async () => {
    const resource = {
      id: 'resource-1',
      userId: 'user-1',
      metadata: {
        name: 'Cat Style',
        styleReferenceImageOriginal: 'https://example.com/cat.png',
        is_public: false,
      },
    };
    const handleResourceClick = vi.fn(async () => undefined);

    render(
      <ResourceBrowserGrid
        browsing={buildBrowsing({
          filteredResources: [resource] as never,
          paginatedResources: [resource] as never,
          handleResourceClick,
          isThumbnailLoaded: () => false,
        })}
        resourceLabelPlural="references"
      />,
    );

    fireEvent.click(screen.getByAltText('Cat Style'));
    expect(handleResourceClick).toHaveBeenCalledWith(resource);
  });
});
