// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { LoraSelectorFooter } from '../LoraSelectorFooter';

function renderFooter(overrides: Partial<ComponentProps<typeof LoraSelectorFooter>> = {}) {
  const props: ComponentProps<typeof LoraSelectorFooter> = {
    footerClass: 'footer',
    isMobile: false,
    showFade: false,
    showAddedLorasOnly: false,
    setShowAddedLorasOnly: vi.fn(),
    showMyLorasOnly: false,
    setShowMyLorasOnly: vi.fn(),
    filteredLoraCount: 12,
    currentPage: 1,
    totalPages: 3,
    onPageChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };

  render(<LoraSelectorFooter {...props} />);
  return props;
}

describe('LoraSelectorFooter', () => {
  it('toggles selected and my-LoRA filters', () => {
    const props = renderFooter();

    fireEvent.click(screen.getByRole('button', { name: /show selected loras|selected/i }));
    fireEvent.click(screen.getByRole('button', { name: /show my loras|my loras/i }));

    expect(props.setShowAddedLorasOnly).toHaveBeenCalledWith(true);
    expect(props.setShowMyLorasOnly).toHaveBeenCalledWith(true);
  });

  it('shows pagination and emits page changes', () => {
    const props = renderFooter({ currentPage: 1, totalPages: 4 });

    expect(screen.getByText('2 / 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '←' }));
    fireEvent.click(screen.getByRole('button', { name: '→' }));

    expect(props.onPageChange).toHaveBeenCalledWith(0);
    expect(props.onPageChange).toHaveBeenCalledWith(2);
  });

  it('shows count label variants and closes modal', () => {
    const props = renderFooter({ showAddedLorasOnly: true, showMyLorasOnly: true, filteredLoraCount: 3 });

    expect(screen.getByText('3 added')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
