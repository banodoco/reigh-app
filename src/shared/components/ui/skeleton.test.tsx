import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Skeleton } from './skeleton';

describe('Skeleton', () => {
  it('renders with base and custom classes', () => {
    render(<Skeleton data-testid="skeleton" className="custom-skeleton" />);
    const skeleton = screen.getByTestId('skeleton');

    expect(skeleton.tagName.toLowerCase()).toBe('div');
    expect(skeleton.className).toContain('animate-pulse');
    expect(skeleton.className).toContain('custom-skeleton');
  });
});
