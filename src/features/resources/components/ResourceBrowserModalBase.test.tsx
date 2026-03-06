import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceBrowserModalBase } from './ResourceBrowserModalBase';

const mocks = vi.hoisted(() => ({
  useLargeModal: vi.fn(),
  useScrollFade: vi.fn(),
  useResourceBrowserData: vi.fn(),
  ResourceBrowserGrid: vi.fn(() => <div data-testid="resource-browser-grid" />),
}));

vi.mock('@/shared/hooks/useModal', () => ({
  useLargeModal: (...args: unknown[]) => mocks.useLargeModal(...args),
}));

vi.mock('@/shared/hooks/useScrollFade', () => ({
  useScrollFade: (...args: unknown[]) => mocks.useScrollFade(...args),
}));

vi.mock('@/shared/hooks/resources/useResourceBrowserData', () => ({
  useResourceBrowserData: (...args: unknown[]) => mocks.useResourceBrowserData(...args),
}));

vi.mock('@/shared/components/resources/ResourceBrowserGrid', () => ({
  ResourceBrowserGrid: (props: unknown) => mocks.ResourceBrowserGrid(props),
}));

vi.mock('@/shared/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/shared/components/ui/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

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

vi.mock('@/shared/components/ui/input', () => ({
  Input: ({
    value,
    onChange,
    placeholder,
  }: {
    value?: string;
    onChange?: (event: { target: { value: string } }) => void;
    placeholder?: string;
  }) => (
    <input
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange?.({ target: { value: event.target.value } })}
    />
  ),
}));

vi.mock('lucide-react', () => ({
  ChevronLeft: () => <span>left</span>,
  ChevronRight: () => <span>right</span>,
  Image: () => <span>image-icon</span>,
  Search: () => <span>search-icon</span>,
  Video: () => <span>video-icon</span>,
  X: ({ onClick }: { onClick?: () => void }) => <button onClick={onClick}>x</button>,
}));

describe('ResourceBrowserModalBase', () => {
  it('renders modal controls from browsing state and forwards user actions', () => {
    const handleSearch = vi.fn();
    const handlePageChange = vi.fn();
    const clearSearch = vi.fn();
    const toggleMyResourcesFilter = vi.fn();
    const onOpenChange = vi.fn();

    mocks.useLargeModal.mockReturnValue({
      className: 'modal-class',
      style: {},
      headerClass: 'header-class',
      scrollClass: 'scroll-class',
      footerClass: 'footer-class',
    });
    mocks.useScrollFade.mockReturnValue({
      showFade: true,
      scrollRef: { current: null },
    });
    mocks.useResourceBrowserData.mockReturnValue({
      isVideoMode: true,
      filteredResources: [{ id: 'r1' }, { id: 'r2' }],
      showMyResourcesOnly: false,
      toggleMyResourcesFilter,
      clearMyResourcesFilter: vi.fn(),
      searchTerm: 'sunset',
      handleSearch,
      clearSearch,
      totalPages: 3,
      currentPage: 1,
      handlePageChange,
    });

    render(
      <ResourceBrowserModalBase
        isOpen={true}
        onOpenChange={onOpenChange}
        resourceType="structure-video"
      />,
    );

    expect(screen.getByText('Browse Guidance Videos')).toBeInTheDocument();
    expect(screen.getByText('2 videos')).toBeInTheDocument();
    expect(screen.getByTestId('resource-browser-grid')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /my videos/i }));
    expect(toggleMyResourcesFilter).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByLabelText('Search videos...'), { target: { value: 'forest' } });
    expect(handleSearch).toHaveBeenCalledWith('forest');

    fireEvent.click(screen.getByRole('button', { name: /clear search/i }));
    expect(clearSearch).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(handlePageChange).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
