import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ItemMetadataBar } from './ItemMetadataBar';

vi.mock('./InfoTooltip', () => ({
  InfoTooltip: () => <div data-testid="info-tooltip" />,
}));

vi.mock('@/shared/components/VariantBadge', () => ({
  VariantBadge: () => <div data-testid="variant-badge" />,
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: Record<string, unknown>) => <button {...props}>{children}</button>,
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: unknown }) => <>{children}</>,
  Tooltip: ({ children }: { children: unknown }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: unknown }) => <>{children}</>,
  TooltipContent: ({ children }: { children: unknown }) => <div>{children}</div>,
}));

vi.mock('lucide-react', () => ({
  Check: () => <svg data-testid="icon-check" />,
  Copy: () => <svg data-testid="icon-copy" />,
  Loader2: () => <svg data-testid="icon-loader" />,
  Share2: () => <svg data-testid="icon-share" />,
}));

describe('ItemMetadataBar', () => {
  it('renders metadata controls and share states for non-video content', () => {
    const handleShare = vi.fn();
    const baseProps = {
      image: {
        id: 'img-1',
        derivedCount: 2,
        unviewedVariantCount: 1,
        hasUnviewedVariants: true,
      },
      isVideoContent: false,
      isMobile: false,
      taskData: { id: 'task-1' },
      inputImages: ['in.png'],
      shouldShowMetadata: true,
      shouldShowTaskDetails: true,
      setIsInfoOpen: vi.fn(),
      showShare: true,
      taskId: 'task-1',
      handleShare,
      isCreatingShare: false,
      shareCopied: false,
      shareSlug: null,
      onMarkAllVariantsViewed: vi.fn(),
    };

    const { rerender } = render(<ItemMetadataBar {...(baseProps as never)} />);

    expect(screen.getByTestId('info-tooltip')).toBeInTheDocument();
    expect(screen.getByTestId('variant-badge')).toBeInTheDocument();
    expect(screen.getByTestId('icon-share')).toBeInTheDocument();
    expect(screen.getByText('Share this generation')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    expect(handleShare).toHaveBeenCalledTimes(1);

    rerender(<ItemMetadataBar {...({ ...baseProps, shareSlug: 'slug-1' } as never)} />);
    expect(screen.getByTestId('icon-copy')).toBeInTheDocument();
    expect(screen.getByText('Copy share link')).toBeInTheDocument();

    rerender(<ItemMetadataBar {...({ ...baseProps, shareCopied: true, shareSlug: 'slug-1' } as never)} />);
    expect(screen.getByTestId('icon-check')).toBeInTheDocument();
    expect(screen.getByText('Link copied!')).toBeInTheDocument();

    rerender(<ItemMetadataBar {...({ ...baseProps, isCreatingShare: true } as never)} />);
    expect(screen.getByTestId('icon-loader')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('hides variant/share controls for video content or missing share prerequisites', () => {
    const { container } = render(
      <ItemMetadataBar
        {...({
          image: { id: 'img-2' },
          isVideoContent: true,
          isMobile: true,
          taskData: null,
          inputImages: [],
          shouldShowMetadata: false,
          shouldShowTaskDetails: false,
          setIsInfoOpen: vi.fn(),
          showShare: false,
          taskId: null,
          handleShare: vi.fn(),
          isCreatingShare: false,
          shareCopied: false,
          shareSlug: null,
          onMarkAllVariantsViewed: vi.fn(),
        } as never)}
      />,
    );

    expect(screen.getByTestId('info-tooltip')).toBeInTheDocument();
    expect(screen.queryByTestId('variant-badge')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('top-12');
  });
});
