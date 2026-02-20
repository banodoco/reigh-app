import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Input } from './input';

describe('Input', () => {
  it('renders an input and merges caller classes', () => {
    render(<Input aria-label="Prompt" className="custom-input" />);
    const input = screen.getByLabelText('Prompt');

    expect(input.tagName.toLowerCase()).toBe('input');
    expect(input.className).toContain('custom-input');
    expect(input.className).toContain('rounded-md');
  });

  it('shows clear action on hover and invokes onClear', () => {
    const onClear = vi.fn();
    const { container } = render(
      <Input
        aria-label="Search"
        clearable
        defaultValue="hello"
        onClear={onClear}
      />,
    );

    const wrapper = container.querySelector('div.relative');
    expect(wrapper).not.toBeNull();
    fireEvent.mouseEnter(wrapper as Element);

    const clearButton = container.querySelector('button[type="button"]');
    expect(clearButton).not.toBeNull();
    fireEvent.click(clearButton as HTMLButtonElement);

    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
