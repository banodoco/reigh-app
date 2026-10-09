// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConversationPresentation } from './ConversationPresentation.tsx';
import { buildConversationItems } from './contracts.ts';

describe('ConversationPresentation', () => {
  it('renders explicit host data and delegates host actions without live hooks', () => {
    const onNew = vi.fn();
    const onSubmit = vi.fn();
    const items = buildConversationItems([
      { role: 'user', content: 'Arrange these clips.', timestamp: '2026-09-27T10:00:00Z' },
      { role: 'assistant', content: 'I prepared a quiet sequence.', timestamp: '2026-09-27T10:00:01Z' },
    ]);

    render(
      <ConversationPresentation
        items={items}
        headerActions={<button onClick={onNew}>New</button>}
        footer={<button onClick={onSubmit}>Send</button>}
      />,
    );

    expect(screen.getByText('Arrange these clips.')).toBeInTheDocument();
    expect(screen.getByText('I prepared a quiet sequence.')).toBeInTheDocument();
    expect(screen.getByText('Astrid')).toBeInTheDocument();
    expect(screen.getByText('Astrid').closest('[data-conversation-presentation]')).toHaveAttribute(
      'data-conversation-presentation',
      'shared-v1',
    );
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onNew).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('renders loading, empty, optimistic and pending states from explicit view data', () => {
    const { rerender } = render(
      <ConversationPresentation items={[]} isLoading emptyState={<p>Empty</p>} />,
    );
    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Empty')).not.toBeInTheDocument();

    rerender(<ConversationPresentation items={[]} emptyState={<p>Empty</p>} />);
    expect(screen.getByText('Empty')).toBeInTheDocument();

    rerender(
      <ConversationPresentation
        items={[]}
        optimisticMessage={{ text: 'Queued request', attachments: [] }}
        hasPendingWork
      />,
    );
    expect(screen.getByText('Queued request')).toBeInTheDocument();
    expect(screen.getByText('Thinking...')).toBeInTheDocument();
    rerender(<ConversationPresentation items={[]} optimisticMessage={{ text: 'Queued request', attachments: [] }} />);
    expect(screen.getByText('Queued request')).toBeInTheDocument();
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument();
  });
});
