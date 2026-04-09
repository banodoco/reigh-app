// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentChat } from './AgentChat';

const mocks = vi.hoisted(() => ({
  useAgentSessions: vi.fn(),
  useCreateSession: vi.fn(),
  useAgentSession: vi.fn(),
  useSendMessage: vi.fn(),
  useCancelSession: vi.fn(),
  useSelectedMediaClips: vi.fn(),
  useGallerySelection: vi.fn(),
  useAgentVoice: vi.fn(),
  loadGenerationForLightbox: vi.fn(),
}));

vi.mock('@/tools/video-editor/hooks/useAgentSession', () => ({
  useAgentSessions: (...args: unknown[]) => mocks.useAgentSessions(...args),
  useCreateSession: (...args: unknown[]) => mocks.useCreateSession(...args),
  useAgentSession: (...args: unknown[]) => mocks.useAgentSession(...args),
  useSendMessage: (...args: unknown[]) => mocks.useSendMessage(...args),
  useCancelSession: (...args: unknown[]) => mocks.useCancelSession(...args),
}));

vi.mock('@/tools/video-editor/hooks/useSelectedMediaClips', async () => {
  const actual = await vi.importActual<typeof import('@/tools/video-editor/hooks/useSelectedMediaClips')>(
    '@/tools/video-editor/hooks/useSelectedMediaClips',
  );

  return {
    ...actual,
    useSelectedMediaClips: (...args: unknown[]) => mocks.useSelectedMediaClips(...args),
  };
});

vi.mock('@/shared/contexts/GallerySelectionContext', () => ({
  useGallerySelection: (...args: unknown[]) => mocks.useGallerySelection(...args),
}));

vi.mock('@/shared/contexts/PanesContext', () => ({
  usePanes: () => ({ isTasksPaneLocked: false, tasksPaneWidth: 0, isGenerationsPaneLocked: false, isGenerationsPaneOpen: false, effectiveGenerationsPaneHeight: 0 }),
}));

vi.mock('@/tools/video-editor/hooks/useAgentVoice', () => ({
  useAgentVoice: (...args: unknown[]) => mocks.useAgentVoice(...args),
}));

vi.mock('@/tools/video-editor/lib/generation-utils', () => ({
  loadGenerationForLightbox: (...args: unknown[]) => mocks.loadGenerationForLightbox(...args),
}));

vi.mock('@/domains/media-lightbox/MediaLightbox', () => ({
  MediaLightbox: ({ media }: { media: { id: string } }) => <div data-testid="media-lightbox">{media.id}</div>,
}));

vi.mock('./AgentChatMessage', () => ({
  AgentChatMessage: ({ turn }: { turn: { content: string } }) => <div>{turn.content}</div>,
  AgentChatToolGroup: () => null,
  AgentChatAttachmentStrip: ({
    attachments,
    onAttachmentClick,
  }: {
    attachments: Array<{ clipId: string; mediaType: string }>;
    onAttachmentClick?: (attachment: { clipId: string; mediaType: string }) => void;
  }) => (
    <div>
      {attachments.map((attachment, index) => (
        <button
          key={attachment.clipId}
          type="button"
          onClick={() => onAttachmentClick?.(attachment)}
        >
          {`preview-${index + 1}-${attachment.mediaType}`}
        </button>
      ))}
    </div>
  ),
}));

describe('AgentChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });

    mocks.useAgentSessions.mockReturnValue({
      data: [
        {
          id: 'session-1',
        },
      ],
      isLoading: false,
    });
    mocks.useCreateSession.mockReturnValue({
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    });
    mocks.useAgentSession.mockReturnValue({
      data: {
        id: 'session-1',
        status: 'waiting_user',
        turns: [],
      },
      isLoading: false,
    });
    mocks.useCancelSession.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    mocks.useSendMessage.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
      localError: null,
    });
    mocks.useSelectedMediaClips.mockReturnValue({
      clips: [
        {
          clipId: 'timeline-clip-1',
          assetKey: 'asset-1',
          url: 'https://example.com/shared.png',
          mediaType: 'image',
        },
      ],
      summary: 'attaching 1 image',
    });
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(),
      gallerySelectionMap: new Map(),
      gallerySummary: 'attaching 1 image, 1 video',
      selectedGalleryClips: [
        {
          clipId: 'gallery-gen-1',
          assetKey: '',
          url: 'https://example.com/shared.png',
          mediaType: 'image',
          generationId: 'gen-1',
        },
        {
          clipId: 'gallery-gen-2',
          assetKey: '',
          url: 'https://example.com/video.mp4',
          mediaType: 'video',
          generationId: 'gen-2',
        },
      ],
      selectGalleryItem: vi.fn(),
      selectGalleryItems: vi.fn(),
      clearGallerySelection: vi.fn(),
    });
    mocks.useAgentVoice.mockReturnValue({
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      toggleRecording: vi.fn(),
      isRecording: false,
      isProcessing: false,
      audioLevel: 0,
      remainingSeconds: 30,
    });
    mocks.loadGenerationForLightbox.mockResolvedValue({
      id: 'gen-1',
      generation_id: 'gen-1',
      location: 'https://example.com/shared.png',
      imageUrl: 'https://example.com/shared.png',
      thumbUrl: 'https://example.com/shared.png',
      type: 'image',
      createdAt: '2026-04-04T12:00:00.000Z',
      starred: false,
      name: 'Reference',
      based_on: null,
      params: {},
      primary_variant_id: 'variant-1',
    });
  });

  it('merges timeline and gallery attachments by URL and clears gallery selection after send', async () => {
    render(<AgentChat timelineId="timeline-1" />);

    fireEvent.click(screen.getByTitle('Timeline Agent (Cmd+Shift+R to talk)'));

    expect(await screen.findByText('attaching 1 image, 1 video')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Type or press Cmd+Shift+R to talk...');
    await waitFor(() => expect(input).not.toBeDisabled());

    fireEvent.change(input, { target: { value: 'Use these references' } });
    fireEvent.click(screen.getByTitle('Send'));

    const sendMessage = mocks.useSendMessage.mock.results[0]?.value;
    const gallerySelection = mocks.useGallerySelection.mock.results[0]?.value;

    await waitFor(() => {
      expect(sendMessage.mutateAsync).toHaveBeenCalledWith({
        message: 'Use these references',
        attachments: [
          {
            clipId: 'gallery-gen-1',
            url: 'https://example.com/shared.png',
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
      });
    });

    expect(gallerySelection.clearGallerySelection).toHaveBeenCalledTimes(1);
  });

  it('renders composer attachment previews and opens the lightbox from a selected attachment', async () => {
    render(<AgentChat timelineId="timeline-1" />);

    fireEvent.click(screen.getByTitle('Timeline Agent (Cmd+Shift+R to talk)'));

    expect(await screen.findByText('attaching 1 image, 1 video')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'preview-1-image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'preview-2-video' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'preview-1-image' }));

    await waitFor(() => {
      expect(mocks.loadGenerationForLightbox).toHaveBeenCalledWith('gen-1');
    });

    expect(await screen.findByTestId('media-lightbox')).toHaveTextContent('gen-1');
  });

  it('disables sending when the active session has been cancelled', async () => {
    mocks.useAgentSession.mockReturnValue({
      data: {
        id: 'session-1',
        status: 'cancelled',
        turns: [],
      },
      isLoading: false,
    });

    render(<AgentChat timelineId="timeline-1" />);

    fireEvent.click(screen.getByTitle('Timeline Agent (Cmd+Shift+R to talk)'));

    expect(await screen.findByText('Session stopped. Start a new conversation to continue.')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Type or press Cmd+Shift+R to talk...');
    const voiceButton = screen.getByTitle('Voice input (Cmd+Shift+R)');
    const sendButton = screen.getByTitle('Send');

    expect(input).toBeDisabled();
    expect(voiceButton).toBeDisabled();
    expect(sendButton).toBeDisabled();
  });
});
