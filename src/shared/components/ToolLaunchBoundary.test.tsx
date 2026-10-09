import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ToolLaunchBoundary } from './ToolLaunchBoundary';

describe('ToolLaunchBoundary', () => {
  it('mounts the existing page only for a current admitted Tool entry', () => {
    render(<ToolLaunchBoundary toolId="video-editor"><div data-testid="existing-editor-page" /></ToolLaunchBoundary>);
    expect(screen.getByTestId('existing-editor-page')).toBeInTheDocument();
  });

  it('shows a binding diagnostic before a missing Tool page can mount', () => {
    render(<ToolLaunchBoundary toolId="travel-between-images"><div data-testid="hidden-page" /></ToolLaunchBoundary>);
    expect(screen.getByTestId('tool-unavailable')).toHaveAttribute('data-reason', 'missing-catalog-entry');
    expect(screen.queryByTestId('hidden-page')).not.toBeInTheDocument();
  });
});
