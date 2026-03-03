import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VideoTravelListHeader } from './VideoTravelListHeader';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/shared/components/ui/segmented-control', () => ({
  SegmentedControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SegmentedControlItem: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

describe('VideoTravelListHeader', () => {
  function buildProps(overrides: Partial<React.ComponentProps<typeof VideoTravelListHeader>> = {}) {
    return {
      viewMode: {
        showVideosView: false,
        setViewMode: vi.fn(),
      },
      search: {
        isMobile: false,
        isSearchOpen: false,
        setIsSearchOpen: vi.fn(),
        handleSearchToggle: vi.fn(),
        searchInputRef: { current: null } as React.RefObject<HTMLInputElement>,
        shotSearchQuery: '',
        setShotSearchQuery: vi.fn(),
        videoSearchTerm: '',
        setVideoSearchTerm: vi.fn(),
        setVideoPage: vi.fn(),
      },
      sort: {
        showVideosView: false,
        shotSortMode: 'oldest',
        setShotSortMode: vi.fn(),
        videoSortMode: 'oldest',
        setVideoSortMode: vi.fn(),
        setVideoPage: vi.fn(),
      },
      ...overrides,
    } as React.ComponentProps<typeof VideoTravelListHeader>;
  }

  it('handles desktop shots search and sort toggling', () => {
    const setShotSearchQuery = vi.fn();
    const setShotSortMode = vi.fn();
    render(
      <VideoTravelListHeader
        {...buildProps({
          search: { ...buildProps().search, setShotSearchQuery, shotSearchQuery: 'cat' },
          sort: { ...buildProps().sort, setShotSortMode, shotSortMode: 'oldest' },
        })}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'dog' } });
    expect(setShotSearchQuery).toHaveBeenCalledWith('dog');

    fireEvent.click(screen.getByRole('button', { name: /Oldest first/i }));
    expect(setShotSortMode).toHaveBeenCalledWith('newest');

    const iconButtons = screen.getAllByRole('button').filter((btn) => btn.textContent === '');
    fireEvent.click(iconButtons[iconButtons.length - 1]);
    expect(setShotSearchQuery).toHaveBeenCalledWith('');
  });

  it('handles desktop videos search clear and sort reset', () => {
    const setVideoSearchTerm = vi.fn();
    const setVideoPageSearch = vi.fn();
    const setVideoSortMode = vi.fn();
    const setVideoPageSort = vi.fn();
    render(
      <VideoTravelListHeader
        {...buildProps({
          viewMode: { showVideosView: true, setViewMode: vi.fn() },
          search: {
            ...buildProps().search,
            videoSearchTerm: 'bird',
            setVideoSearchTerm,
            setVideoPage: setVideoPageSearch,
          },
          sort: {
            ...buildProps().sort,
            videoSortMode: 'oldest',
            setVideoSortMode,
            setVideoPage: setVideoPageSort,
          },
        })}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('Search...'), { target: { value: 'owl' } });
    expect(setVideoSearchTerm).toHaveBeenCalledWith('owl');
    expect(setVideoPageSearch).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole('button', { name: /Oldest first/i }));
    expect(setVideoSortMode).toHaveBeenCalledWith('newest');
    expect(setVideoPageSort).toHaveBeenCalledWith(1);
  });

  it('handles mobile search toggle and close-clear action', () => {
    const handleSearchToggle = vi.fn();
    const setIsSearchOpen = vi.fn();
    const setShotSearchQuery = vi.fn();
    render(
      <VideoTravelListHeader
        {...buildProps({
          search: {
            ...buildProps().search,
            isMobile: true,
            isSearchOpen: true,
            handleSearchToggle,
            setIsSearchOpen,
            shotSearchQuery: 'term',
            setShotSearchQuery,
          },
        })}
      />,
    );

    fireEvent.click(screen.getByTitle('Close search'));
    expect(handleSearchToggle).toHaveBeenCalledTimes(1);

    const iconButtons = screen.getAllByRole('button').filter((btn) => btn.textContent === '');
    fireEvent.click(iconButtons[iconButtons.length - 1]);
    expect(setShotSearchQuery).toHaveBeenCalledWith('');
    expect(setIsSearchOpen).toHaveBeenCalledWith(false);
  });

  it('uses segmented controls to switch view modes with blur targets', () => {
    const setViewMode = vi.fn();
    render(
      <VideoTravelListHeader
        {...buildProps({
          viewMode: { showVideosView: false, setViewMode },
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Shots' }));
    expect(setViewMode).toHaveBeenCalledWith(
      'shots',
      expect.objectContaining({ blurTarget: expect.any(HTMLElement) }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Videos' }));
    expect(setViewMode).toHaveBeenCalledWith(
      'videos',
      expect.objectContaining({ blurTarget: expect.any(HTMLElement) }),
    );
  });
});
