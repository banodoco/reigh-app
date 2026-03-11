// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GuidanceVideoStripRangeControls } from './GuidanceVideoStripRangeControls';

vi.mock('@/shared/components/ui/select', async () => {
  const React = await import('react');
  const SelectContext = React.createContext<(value: string) => void>(() => {});

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <SelectContext.Provider value={onValueChange ?? (() => {})}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
    SelectValue: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const onValueChange = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange(value)}>
          {children}
        </button>
      );
    },
  };
});

describe('GuidanceVideoStripRangeControls', () => {
  function buildProps(
    overrides: Partial<React.ComponentProps<typeof GuidanceVideoStripRangeControls>> = {},
  ) {
    return {
      displayOutputStart: 5,
      displayOutputEnd: 35,
      isDragging: false,
      treatment: 'adjust',
      onTreatmentChange: vi.fn(),
      onRangeChange: vi.fn(),
      effectiveMetadataTotalFrames: 20,
      useAbsolutePosition: false,
      ...overrides,
    } satisfies React.ComponentProps<typeof GuidanceVideoStripRangeControls>;
  }

  it('shows the output frame bounds and clips the range when switching to 1:1 mapping', () => {
    const onTreatmentChange = vi.fn();
    const onRangeChange = vi.fn();

    render(
      <GuidanceVideoStripRangeControls
        {...buildProps({
          onTreatmentChange,
          onRangeChange,
        })}
      />,
    );

    expect(screen.getByText('f5')).toBeInTheDocument();
    expect(screen.getByText('f35')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fit to range' })).toBeInTheDocument();

    fireEvent.click(screen.getByText('1:1 mapping'));

    expect(onRangeChange).toHaveBeenCalledWith(5, 25);
    expect(onTreatmentChange).toHaveBeenCalledWith('clip');
  });

  it('switches treatments without range clipping when the current duration already fits', () => {
    const onTreatmentChange = vi.fn();
    const onRangeChange = vi.fn();

    render(
      <GuidanceVideoStripRangeControls
        {...buildProps({
          treatment: 'clip',
          displayOutputStart: 5,
          displayOutputEnd: 20,
          effectiveMetadataTotalFrames: 30,
          onTreatmentChange,
          onRangeChange,
          useAbsolutePosition: true,
        })}
      />,
    );

    fireEvent.click(screen.getByText('Fit to range'));

    expect(onRangeChange).not.toHaveBeenCalled();
    expect(onTreatmentChange).toHaveBeenCalledWith('adjust');
  });
});
