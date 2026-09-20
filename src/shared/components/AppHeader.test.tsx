// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from '@/shared/components/AppHeader.tsx';

describe('AppHeader', () => {
  it('uses Home navigation when the editor is not the home tool', () => {
    const onNavigate = vi.fn();

    render(
      <AppHeader
        onNavigate={onNavigate}
        navigationControls={<div data-testid="selectors">Project One</div>}
        timelineName="Main timeline"
      />,
    );

    expect(screen.getByRole('button', { name: 'Go home' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open tools' })).toBeNull();
    expect(screen.getByTestId('selectors')).toBeInTheDocument();
    expect(screen.getByText('Main timeline')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go home' }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it('uses Tools navigation when the editor is the home tool', () => {
    render(
      <AppHeader
        navigationMode="tools"
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Open tools' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Go home' })).toBeNull();
  });
});
