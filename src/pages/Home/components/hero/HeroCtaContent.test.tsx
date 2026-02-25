import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroCtaContent } from './HeroCtaContent';

describe('HeroCtaContent', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('transitions to updated CTA text', () => {
    vi.useFakeTimers();

    const { rerender } = render(<HeroCtaContent icon="plus" text="Install app" />);
    expect(screen.getByText('Install app')).toBeInTheDocument();

    rerender(<HeroCtaContent icon="external" text="Go to tools" />);

    act(() => {
      vi.advanceTimersByTime(160);
    });

    expect(screen.getByText('Go to tools')).toBeInTheDocument();
  });
});
