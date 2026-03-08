import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PhaseConfigHeader } from './PhaseConfigHeader';

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode } & Record<string, unknown>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe('PhaseConfigHeader', () => {
  it('renders title and action tooltip labels', () => {
    render(
      <PhaseConfigHeader
        onLoadPreset={vi.fn()}
        onSaveAsPreset={vi.fn()}
        onOverwritePreset={vi.fn()}
        onRestoreDefaults={vi.fn()}
      />, 
    );

    expect(screen.getByText('Phase Configuration')).toBeInTheDocument();
    expect(screen.getByText('Load Preset')).toBeInTheDocument();
    expect(screen.getByText('Save As Preset')).toBeInTheDocument();
    expect(screen.getByText('Overwrite Preset')).toBeInTheDocument();
    expect(screen.getByText('Restore Defaults')).toBeInTheDocument();
  });

  it('wires each icon button to the corresponding callback', () => {
    const onLoadPreset = vi.fn();
    const onSaveAsPreset = vi.fn();
    const onOverwritePreset = vi.fn();
    const onRestoreDefaults = vi.fn();

    render(
      <PhaseConfigHeader
        onLoadPreset={onLoadPreset}
        onSaveAsPreset={onSaveAsPreset}
        onOverwritePreset={onOverwritePreset}
        onRestoreDefaults={onRestoreDefaults}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);

    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    fireEvent.click(buttons[2]);
    fireEvent.click(buttons[3]);

    expect(onLoadPreset).toHaveBeenCalledTimes(1);
    expect(onSaveAsPreset).toHaveBeenCalledTimes(1);
    expect(onOverwritePreset).toHaveBeenCalledTimes(1);
    expect(onRestoreDefaults).toHaveBeenCalledTimes(1);
  });
});
