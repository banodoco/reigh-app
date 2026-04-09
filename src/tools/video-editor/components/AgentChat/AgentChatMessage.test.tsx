// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AgentChatMessage } from './AgentChatMessage';

describe('AgentChatMessage', () => {
  it('renders attachment summaries for gallery-style attachments that include generationId', () => {
    render(
      <AgentChatMessage
        turn={{
          role: 'assistant',
          content: 'I used your selected references.',
          attachments: [
            {
              clipId: 'gallery-gen-1',
              url: 'https://example.com/image.png',
              mediaType: 'image',
              generationId: 'gen-1',
            },
            {
              clipId: 'gallery-gen-2',
              url: 'https://example.com/video.mp4',
              mediaType: 'video',
              generationId: 'gen-2',
            },
          ],
          timestamp: '2026-04-04T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByText('I used your selected references.')).toBeInTheDocument();
    expect(screen.getByLabelText('Attached image 1')).toBeInTheDocument();
    expect(screen.getByLabelText('Attached video 2')).toBeInTheDocument();
    expect(screen.getByText('1 image, 1 video attached')).toBeInTheDocument();
  });

  it('collapses extra attachment previews behind a count badge', () => {
    render(
      <AgentChatMessage
        turn={{
          role: 'user',
          content: 'Use these attachments.',
          attachments: [
            { clipId: 'clip-1', url: 'https://example.com/1.png', mediaType: 'image' },
            { clipId: 'clip-2', url: 'https://example.com/2.png', mediaType: 'image' },
            { clipId: 'clip-3', url: 'https://example.com/3.png', mediaType: 'image' },
            { clipId: 'clip-4', url: 'https://example.com/4.png', mediaType: 'image' },
            { clipId: 'clip-5', url: 'https://example.com/5.png', mediaType: 'image' },
          ],
          timestamp: '2026-04-04T12:00:00.000Z',
        }}
      />,
    );

    expect(screen.getAllByLabelText(/Attached image \d/)).toHaveLength(4);
    expect(screen.getByLabelText('1 more attachments')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.getByText('5 images attached')).toBeInTheDocument();
  });

  it('calls the attachment click handler for clickable previews', () => {
    const onAttachmentClick = vi.fn();

    render(
      <AgentChatMessage
        turn={{
          role: 'assistant',
          content: 'I used your selected references.',
          attachments: [
            {
              clipId: 'gallery-gen-1',
              url: 'https://example.com/image.png',
              mediaType: 'image',
              generationId: 'gen-1',
            },
          ],
          timestamp: '2026-04-04T12:00:00.000Z',
        }}
        onAttachmentClick={onAttachmentClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open attached image 1' }));

    expect(onAttachmentClick).toHaveBeenCalledWith({
      clipId: 'gallery-gen-1',
      url: 'https://example.com/image.png',
      mediaType: 'image',
      generationId: 'gen-1',
    });
  });
});
