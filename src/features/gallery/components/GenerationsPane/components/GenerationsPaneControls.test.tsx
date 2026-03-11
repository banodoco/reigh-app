import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GenerationsPaneControls } from './GenerationsPaneControls';
import { SHOT_FILTER } from '@/shared/constants/filterConstants';

vi.mock('@/shared/components/ShotFilter', () => ({
  ShotFilter: ({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) => (
    <button type="button" data-testid="shot-filter" onClick={() => onOpenChange?.(true)}>
      shot-filter
    </button>
  ),
}));

vi.mock('@/shared/components/MediaTypeFilter', () => ({
  MediaTypeFilter: ({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) => (
    <button type="button" data-testid="media-type-filter" onClick={() => onOpenChange?.(true)}>
      media-type-filter
    </button>
  ),
}));

vi.mock('@/shared/components/ui/checkbox', () => ({
  Checkbox: ({
    id,
    checked,
    onCheckedChange,
  }: {
    id?: string;
    checked?: boolean;
    onCheckedChange?: (value: boolean) => void;
  }) => (
    <input
      id={id}
      type="checkbox"
      checked={checked}
      onChange={(e) => onCheckedChange?.(e.target.checked)}
    />
  ),
}));

vi.mock('@/shared/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: () => <span>value</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('GenerationsPaneControls', () => {
  function buildProps(overrides: Partial<React.ComponentProps<typeof GenerationsPaneControls>> = {}) {
    return {
      filters: {
        shots: [],
        selectedShotFilter: SHOT_FILTER.ALL,
        onSelectedShotFilterChange: vi.fn(),
        excludePositioned: false,
        onExcludePositionedChange: vi.fn(),
        isMobile: false,
        shotFilterContentRef: { current: null },
        mediaTypeFilterContentRef: { current: null },
        shotFilterOpen: false,
        onShotFilterOpenChange: vi.fn(),
        mediaTypeFilter: 'all',
        onMediaTypeFilterChange: vi.fn(),
        mediaTypeFilterOpen: false,
        onMediaTypeFilterOpenChange: vi.fn(),
        searchTerm: '',
        onSearchTermChange: vi.fn(),
        isSearchOpen: false,
        onSearchOpenChange: vi.fn(),
        searchInputRef: { current: null },
        starredOnly: false,
        onStarredOnlyChange: vi.fn(),
        currentShotId: null,
        isSpecialFilterSelected: false,
      },
      pagination: {
        totalCount: 3,
        perPage: 10,
        page: 1,
        onPageChange: vi.fn(),
      },
      interaction: {
        isInteractionDisabled: false,
      },
      ...overrides,
    } as React.ComponentProps<typeof GenerationsPaneControls>;
  }

  it('renders count fallback when pagination is not needed', () => {
    render(<GenerationsPaneControls {...buildProps()} />);
    expect(screen.getByText('3 items')).toBeInTheDocument();
  });

  it('toggles search and starred filters via callbacks', () => {
    const onSearchOpenChange = vi.fn();
    const onStarredOnlyChange = vi.fn();
    render(
      <GenerationsPaneControls
        {...buildProps({
          filters: {
            ...buildProps().filters,
            onSearchOpenChange,
            onStarredOnlyChange,
            starredOnly: false,
          },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Search prompts' }));
    fireEvent.click(screen.getByRole('button', { name: 'Show only starred items' }));

    expect(onSearchOpenChange).toHaveBeenCalledWith(true);
    expect(onStarredOnlyChange).toHaveBeenCalledWith(true);
  });

  it('switches to all shots when current-shot filter is active', () => {
    const onSelectedShotFilterChange = vi.fn();
    render(
      <GenerationsPaneControls
        {...buildProps({
          filters: {
            ...buildProps().filters,
            currentShotId: 'shot-1',
            selectedShotFilter: 'shot-1',
            onSelectedShotFilterChange,
          },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /All/i }));
    expect(onSelectedShotFilterChange).toHaveBeenCalledWith(SHOT_FILTER.ALL);
  });

  it('propagates exclude-positioned checkbox changes', () => {
    const onExcludePositionedChange = vi.fn();
    render(
      <GenerationsPaneControls
        {...buildProps({
          filters: {
            ...buildProps().filters,
            onExcludePositionedChange,
            excludePositioned: false,
            isSpecialFilterSelected: false,
          },
        })}
      />,
    );

    fireEvent.click(screen.getByLabelText('Exclude items with a position'));
    expect(onExcludePositionedChange).toHaveBeenCalledWith(true);
  });
});
