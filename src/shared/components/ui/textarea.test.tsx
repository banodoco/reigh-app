import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Textarea } from './textarea';

describe('Textarea', () => {
  it('renders and merges caller classes', () => {
    render(<Textarea aria-label="Prompt" className="custom-textarea" />);
    const textarea = screen.getByLabelText('Prompt');

    expect(textarea.tagName.toLowerCase()).toBe('textarea');
    expect(textarea.className).toContain('custom-textarea');
    expect(textarea.className).toContain('min-h-[80px]');
  });

  it('shows clear action on hover and invokes onClear', () => {
    const onClear = vi.fn();
    const { container } = render(
      <Textarea
        aria-label="Description"
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
