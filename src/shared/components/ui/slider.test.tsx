import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Slider } from './slider';

describe('Slider', () => {
  it('renders root track and thumb with default styling', () => {
    const { container } = render(
      <Slider
        data-testid="slider"
        defaultValue={[25]}
        min={0}
        max={100}
      />,
    );

    const root = screen.getByTestId('slider');
    expect(root.className).toContain('relative');

    const track = container.querySelector('.bg-secondary');
    const thumb = container.querySelector('.rounded-full');
    expect(track).not.toBeNull();
    expect(thumb).not.toBeNull();
  });

  it('applies secondary variant classes', () => {
    const { container } = render(
      <Slider
        data-testid="slider"
        variant="secondary"
        defaultValue={[50]}
        min={0}
        max={100}
      />,
    );

    const track = container.querySelector('.h-1');
    expect(track).not.toBeNull();
    expect(container.innerHTML).toContain('bg-muted-foreground/60');
  });
});
