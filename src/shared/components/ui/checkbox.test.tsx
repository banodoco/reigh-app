import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Checkbox } from './checkbox';

describe('Checkbox', () => {
  it('calls onCheckedChange when toggled', () => {
    const onCheckedChange = vi.fn();

    render(<Checkbox aria-label="Accept terms" onCheckedChange={onCheckedChange} />);
    fireEvent.click(screen.getByLabelText('Accept terms'));

    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(typeof onCheckedChange.mock.calls[0][0]).toBe('boolean');
  });

  it('applies variant and size classes', () => {
    render(<Checkbox aria-label="Retro mode" variant="retro-dark" size="lg" />);
    const checkbox = screen.getByLabelText('Retro mode');

    expect(checkbox.className).toContain('border-2');
    expect(checkbox.className).toContain('!h-5');
  });
});
