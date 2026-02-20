import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Switch } from './switch';

describe('Switch', () => {
  it('renders and toggles checked state callback', () => {
    const onCheckedChange = vi.fn();
    render(<Switch aria-label="Auto play" onCheckedChange={onCheckedChange} />);

    fireEvent.click(screen.getByLabelText('Auto play'));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(typeof onCheckedChange.mock.calls[0][0]).toBe('boolean');
  });

  it('applies size and variant classes', () => {
    render(<Switch aria-label="Retro switch" variant="retro-dark" size="sm" data-testid="switch" />);
    const el = screen.getByTestId('switch');
    expect(el.className).toContain('border-2');
    expect(el.className).toContain('h-5');
  });
});
