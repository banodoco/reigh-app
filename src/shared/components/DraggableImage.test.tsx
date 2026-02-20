import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DraggableImage } from './DraggableImage';

describe('DraggableImage', () => {
  it('renders a non-draggable wrapper and forwards double-click', () => {
    const onDoubleClick = vi.fn();

    render(
      <DraggableImage image={{} as never} onDoubleClick={onDoubleClick}>
        <span>child-content</span>
      </DraggableImage>
    );

    const wrapper = screen.getByText('child-content').closest('div');
    expect(wrapper).toHaveAttribute('draggable', 'false');

    wrapper?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onDoubleClick).toHaveBeenCalledTimes(1);
  });
});
