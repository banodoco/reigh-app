import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClipTimeline } from './ClipTimeline';

vi.mock('@/shared/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: unknown }) => <>{children}</>,
  Tooltip: ({ children }: { children: unknown }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: unknown }) => <>{children}</>,
  TooltipContent: ({ children }: { children: unknown }) => <>{children}</>,
}));

const baseCalculations = {
  totalFrames: 60,
  anchor1Idx: 6,
  anchor2Idx: 12,
  clipAKeptFrames: 18,
  clipBKeptFrames: 20,
  totalGenerationFlex: 22,
  contextFlex: 6,
  clipAKeptFlex: 18,
  clipBKeptFlex: 20,
  generationWindowLeftPct: 30,
  generationWindowWidthPct: 40,
};

describe('ClipTimeline', () => {
  it('renders non-replace mode with generated section and bridging anchor explanations', () => {
    render(
      <ClipTimeline
        gapFrames={24}
        contextFrames={6}
        replaceMode={false}
        keepBridgingImages
        calculations={baseCalculations}
      />,
    );

    expect(screen.getAllByText('Clip A').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Clip B').length).toBeGreaterThan(0);
    expect(screen.getByText('Generated')).toBeInTheDocument();
    expect(screen.getByText('generated')).toBeInTheDocument();
    expect(screen.getByText(/Anchor: Last frame of Clip A inserted here/)).toBeInTheDocument();
    expect(screen.getByText(/Anchor: First frame of Clip B inserted here/)).toBeInTheDocument();
    expect(screen.getByText('Generation Window: 60 frames')).toBeInTheDocument();
  });

  it('renders replace mode with replaced label and omits anchor markers when disabled', () => {
    render(
      <ClipTimeline
        gapFrames={24}
        contextFrames={6}
        replaceMode
        keepBridgingImages={false}
        calculations={baseCalculations}
      />,
    );

    expect(screen.getByText('replaced')).toBeInTheDocument();
    expect(screen.getByText(/24 new frames will be generated to replace the seam/)).toBeInTheDocument();
    expect(screen.queryByText(/Anchor frame taken from the original Clip A video/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Anchor frame taken from the original Clip B video/)).not.toBeInTheDocument();
    expect(screen.getByText('Generation Window: 60 frames')).toBeInTheDocument();
  });
});
