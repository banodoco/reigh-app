import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SegmentedControl, SegmentedControlItem } from './segmented-control';

describe('SegmentedControl', () => {
  it('renders a radiogroup and reports value changes', () => {
    const onValueChange = vi.fn();

    render(
      <SegmentedControl value="images" onValueChange={onValueChange}>
        <SegmentedControlItem value="images">Images</SegmentedControlItem>
        <SegmentedControlItem value="videos">Videos</SegmentedControlItem>
      </SegmentedControl>,
    );

    const images = screen.getByRole('radio', { name: 'Images' });
    const videos = screen.getByRole('radio', { name: 'Videos' });
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(images).toHaveAttribute('aria-checked', 'true');
    expect(videos).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(videos);
    expect(onValueChange).toHaveBeenCalledWith('videos');
  });

  it('applies variant and size classes', () => {
    render(
      <SegmentedControl value="a" onValueChange={() => {}} variant="retro" size="sm" data-testid="control">
        <SegmentedControlItem value="a">A</SegmentedControlItem>
      </SegmentedControl>,
    );

    const control = screen.getByTestId('control');
    expect(control.className).toContain('border-2');
    expect(control.className).toContain('h-8');
  });
});
