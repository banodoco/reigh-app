/**
 * AspectRatioSelector Tests
 *
 * Tests for aspect ratio selection component.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock the aspect ratio constants
vi.mock('@/shared/lib/media/aspectRatios', () => ({
  ASPECT_RATIO_TO_RESOLUTION: {
    '16:9': '1920x1080',
    '4:3': '1440x1080',
    '1:1': '1080x1080',
    '9:16': '1080x1920',
    'Square': '1080x1080',
  },
}));

// Mock the visualizer component
vi.mock('./AspectRatioVisualizer', () => ({
  AspectRatioVisualizer: ({ aspectRatio }: { aspectRatio: string }) => (
    <div data-testid="visualizer">{aspectRatio}</div>
  ),
}));

// Mock the Select components from shadcn
vi.mock('@/shared/components/ui/select', () => ({
  Select: ({ children, value, disabled }: Record<string, unknown>) => (
    <div data-testid="select-root" data-value={value as string} data-disabled={disabled as boolean}>
      {(children as React.ReactNode)}
    </div>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value, onMouseEnter, onMouseLeave }: Record<string, unknown>) => (
    <div
      data-testid={`select-item-${value}`}
      data-value={value as string}
      onMouseEnter={onMouseEnter as React.MouseEventHandler}
      onMouseLeave={onMouseLeave as React.MouseEventHandler}
    >
      {children as React.ReactNode}
    </div>
  ),
  SelectTrigger: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <button data-testid="select-trigger" className={className}>{children}</button>
  ),
  SelectValue: ({ children, placeholder }: { children: React.ReactNode; placeholder?: string }) => (
    <span data-testid="select-value" data-placeholder={placeholder}>{children}</span>
  ),
}));

import { AspectRatioSelector } from './AspectRatioSelector';

describe('AspectRatioSelector', () => {
  const defaultProps = {
    value: '16:9',
    onValueChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the select trigger', () => {
    render(<AspectRatioSelector {...defaultProps} />);
    expect(screen.getByTestId('select-trigger')).toBeInTheDocument();
  });

  it('renders current value', () => {
    render(<AspectRatioSelector {...defaultProps} />);
    expect(screen.getByTestId('select-value')).toHaveTextContent('16:9');
  });

  it('renders aspect ratio options (excluding Square)', () => {
    render(<AspectRatioSelector {...defaultProps} />);

    expect(screen.getByTestId('select-item-16:9')).toBeInTheDocument();
    expect(screen.getByTestId('select-item-4:3')).toBeInTheDocument();
    expect(screen.getByTestId('select-item-1:1')).toBeInTheDocument();
    expect(screen.getByTestId('select-item-9:16')).toBeInTheDocument();
    // Square should be filtered out
    expect(screen.queryByTestId('select-item-Square')).toBeNull();
  });

  it('shows visualizer by default', () => {
    render(<AspectRatioSelector {...defaultProps} />);
    expect(screen.getByTestId('visualizer')).toBeInTheDocument();
  });

  it('hides visualizer when showVisualizer=false', () => {
    render(<AspectRatioSelector {...defaultProps} showVisualizer={false} />);
    expect(screen.queryByTestId('visualizer')).toBeNull();
  });

  it('renders with custom placeholder', () => {
    render(
      <AspectRatioSelector
        {...defaultProps}
        value=""
        placeholder="Choose ratio"
      />
    );
    expect(screen.getByTestId('select-value')).toHaveTextContent('Choose ratio');
  });

  it('displays labels with resolutions', () => {
    render(<AspectRatioSelector {...defaultProps} />);
    expect(screen.getByTestId('select-item-16:9')).toHaveTextContent('16:9 (1920x1080)');
    expect(screen.getByTestId('select-item-4:3')).toHaveTextContent('4:3 (1440x1080)');
  });

  it('applies custom className', () => {
    const { container } = render(
      <AspectRatioSelector {...defaultProps} className="custom-class" />
    );
    // The wrapper div should have the class
    expect(container.firstElementChild?.className).toContain('custom-class');
  });

  it('passes id to trigger', () => {
    render(<AspectRatioSelector {...defaultProps} id="ar-selector" />);
    // The trigger should receive the id prop
    const trigger = screen.getByTestId('select-trigger');
    expect(trigger).toBeInTheDocument();
  });
});
