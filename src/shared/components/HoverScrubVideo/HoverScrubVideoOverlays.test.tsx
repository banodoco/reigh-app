import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HoverScrubVideoOverlays } from './HoverScrubVideoOverlays';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, variant, ...props }: Record<string, unknown>) => (
    <button data-variant={String(variant)} {...props}>{children}</button>
  ),
}));

describe('HoverScrubVideoOverlays', () => {
  it('shows poster activation overlay and calls onActivate on click', () => {
    const onActivate = vi.fn();
    render(
      <HoverScrubVideoOverlays
        posterOnlyUntilClick
        isActivated={false}
        onActivate={onActivate}
        isMobile={false}
        disableScrubbing={false}
        thumbnailMode={false}
        scrubberPosition={50}
        scrubberVisible
        duration={120}
        showSpeedControls
        speedControlsPosition="top-left"
        speedOptions={[0.5, 1, 2]}
        playbackRate={1}
        onSpeedChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('▶'));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('renders scrubber/progress/time and interactive speed controls on desktop', () => {
    const onSpeedChange = vi.fn();
    render(
      <HoverScrubVideoOverlays
        posterOnlyUntilClick={false}
        isActivated
        onActivate={vi.fn()}
        isMobile={false}
        disableScrubbing={false}
        thumbnailMode={false}
        scrubberPosition={25}
        scrubberVisible
        duration={40}
        showSpeedControls
        speedControlsPosition="bottom-center"
        speedOptions={[0.5, 1, 2]}
        playbackRate={1}
        onSpeedChange={onSpeedChange}
      />,
    );

    expect(screen.getByText('10s / 40s')).toBeInTheDocument();
    expect(screen.getByText('0.5x')).toHaveAttribute('data-variant', 'secondary');
    expect(screen.getByText('1x')).toHaveAttribute('data-variant', 'default');
    expect(screen.getByText('2x')).toHaveAttribute('data-variant', 'secondary');

    fireEvent.click(screen.getByText('2x'));
    expect(onSpeedChange).toHaveBeenCalledWith(2);
  });

  it('suppresses scrubber and speed controls when scrubbing is disabled', () => {
    render(
      <HoverScrubVideoOverlays
        posterOnlyUntilClick={false}
        isActivated
        onActivate={vi.fn()}
        isMobile={false}
        disableScrubbing
        thumbnailMode={false}
        scrubberPosition={60}
        scrubberVisible
        duration={90}
        showSpeedControls
        speedControlsPosition="top-left"
        speedOptions={[1]}
        playbackRate={1}
        onSpeedChange={vi.fn()}
      />,
    );

    expect(screen.queryByText(/s \/ /)).not.toBeInTheDocument();
    expect(screen.queryByText('1x')).not.toBeInTheDocument();
  });
});
