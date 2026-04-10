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
  useTimelineEditorOps: vi.fn(),
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

vi.mock('@/tools/video-editor/contexts/TimelineEditorContext', () => ({
  useTimelineEditorOps: (...args: unknown[]) => mocks.useTimelineEditorOps(...args),
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
    onRemoveAttachment,
    onRemoveShot,
  }: {
    attachments: Array<{ clipId: string; mediaType: string }>;
    onAttachmentClick?: (attachment: { clipId: string; mediaType: string }) => void;
    onRemoveAttachment?: (attachment: { clipId: string; mediaType: string }) => void;
    onRemoveShot?: (shotId: string) => void;
  }) => (
    <div>
      {Array.from(new Set(
        attachments
          .map((attachment) => ('shotId' in attachment ? attachment.shotId : undefined))
          .filter((shotId): shotId is string => typeof shotId === 'string'),
      )).map((shotId) => (
        <button
          key={`shot-${shotId}`}
          type="button"
          onClick={() => onRemoveShot?.(shotId)}
        >
          {`remove-shot-${shotId}`}
        </button>
      ))}
      {attachments.map((attachment, index) => (
        <div key={attachment.clipId}>
          <button
            type="button"
            onClick={() => onAttachmentClick?.(attachment)}
          >
            {`preview-${index + 1}-${attachment.mediaType}`}
          </button>
          <button
            type="button"
            onClick={() => onRemoveAttachment?.(attachment)}
          >
            {`remove-${index + 1}-${attachment.mediaType}`}
          </button>
        </div>
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
    mocks.useTimelineEditorOps.mockReturnValue({
      replaceTimelineSelection: vi.fn(),
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
          isTimelineBacked: true,
          shotId: 'shot-1',
          shotName: 'Hero Shot',
          shotSelectionClipCount: 1,
          trackId: 'V1',
          at: 8,
          duration: 2.5,
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
          isTimelineBacked: false,
          generationId: 'gen-1',
        },
        {
          clipId: 'gallery-gen-2',
          assetKey: '',
          url: 'https://example.com/video.mp4',
          mediaType: 'video',
          isTimelineBacked: false,
          generationId: 'gen-2',
        },
      ],
      selectGalleryItem: vi.fn(),
      selectGalleryItems: vi.fn(),
      deselectGalleryItems: vi.fn(),
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

    expect(await screen.findByText('attaching 1 shot (1 image) and 1 more video')).toBeInTheDocument();

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
            isTimelineBacked: true,
            generationId: 'gen-1',
            shotId: 'shot-1',
            shotName: 'Hero Shot',
            shotSelectionClipCount: 1,
            trackId: 'V1',
            at: 8,
            duration: 2.5,
          },
          {
            clipId: 'gallery-gen-2',
            url: 'https://example.com/video.mp4',
            mediaType: 'video',
            isTimelineBacked: false,
            generationId: 'gen-2',
          },
        ],
      });
    });

    expect(gallerySelection.clearGallerySelection).toHaveBeenCalledTimes(1);
  });

  it('includes timeline attachment coordinates in sent attachments', async () => {
    mocks.useSelectedMediaClips.mockReturnValue({
      clips: [
        {
          clipId: 'timeline-clip-coords',
          assetKey: 'asset-coords',
          url: 'https://example.com/coords.png',
          mediaType: 'image',
          isTimelineBacked: true,
          trackId: 'V3',
          at: 14.5,
          duration: 2.25,
        },
      ],
      summary: 'attaching 1 image',
    });
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(),
      gallerySelectionMap: new Map(),
      gallerySummary: '',
      selectedGalleryClips: [],
      selectGalleryItem: vi.fn(),
      selectGalleryItems: vi.fn(),
      deselectGalleryItems: vi.fn(),
      clearGallerySelection: vi.fn(),
    });

    render(<AgentChat timelineId="timeline-1" />);

    fireEvent.click(screen.getByTitle('Timeline Agent (Cmd+Shift+R to talk)'));

    const input = screen.getByPlaceholderText('Type or press Cmd+Shift+R to talk...');
    await waitFor(() => expect(input).not.toBeDisabled());

    fireEvent.change(input, { target: { value: 'Insert after this clip' } });
    fireEvent.click(screen.getByTitle('Send'));

    const sendMessage = mocks.useSendMessage.mock.results[0]?.value;

    await waitFor(() => {
      expect(sendMessage.mutateAsync).toHaveBeenCalledWith({
        message: 'Insert after this clip',
        attachments: [{
          clipId: 'timeline-clip-coords',
          url: 'https://example.com/coords.png',
          mediaType: 'image',
          isTimelineBacked: true,
          trackId: 'V3',
          at: 14.5,
          duration: 2.25,
        }],
      });
    });
  });

  it('renders composer attachment previews and opens the lightbox from a selected attachment', async () => {
    render(<AgentChat timelineId="timeline-1" />);

    fireEvent.click(screen.getByTitle('Timeline Agent (Cmd+Shift+R to talk)'));

    expect(await screen.findByText('attaching 1 shot (1 image) and 1 more video')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'preview-1-image' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'preview-2-video' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'preview-1-image' }));

    await waitFor(() => {
      expect(mocks.loadGenerationForLightbox).toHaveBeenCalledWith('gen-1');
    });

    expect(await screen.findByTestId('media-lightbox')).toHaveTextContent('gen-1');
  });

  it('renders a shot-aware composer summary for whole-shot selections plus extra media', async () => {
    mocks.useSelectedMediaClips.mockReturnValue({
      clips: [
        {
          clipId: 'shot-clip-1',
          assetKey: 'asset-1',
          url: 'https://example.com/shot-1.png',
          mediaType: 'image',
          shotId: 'shot-1',
          shotName: 'Hero Shot',
          shotSelectionClipCount: 4,
        },
        {
          clipId: 'shot-clip-2',
          assetKey: 'asset-2',
          url: 'https://example.com/shot-2.png',
          mediaType: 'image',
          shotId: 'shot-1',
          shotName: 'Hero Shot',
          shotSelectionClipCount: 4,
        },
        {
          clipId: 'shot-clip-3',
          assetKey: 'asset-3',
          url: 'https://example.com/shot-3.png',
          mediaType: 'image',
          shotId: 'shot-1',
          shotName: 'Hero Shot',
          shotSelectionClipCount: 4,
        },
        {
          clipId: 'shot-clip-4',
          assetKey: 'asset-4',
          url: 'https://example.com/shot-4.png',
          mediaType: 'image',
          shotId: 'shot-1',
          shotName: 'Hero Shot',
          shotSelectionClipCount: 4,
        },
      ],
      summary: 'attaching 1 shot (4 images)',
    });
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(['gallery-gen-2', 'gallery-gen-3']),
      gallerySelectionMap: new Map(),
      gallerySummary: 'attaching 2 images',
      selectedGalleryClips: [
        {
          clipId: 'gallery-gen-2',
          assetKey: '',
          url: 'https://example.com/extra-1.png',
          mediaType: 'image',
          generationId: 'gen-2',
        },
        {
          clipId: 'gallery-gen-3',
          assetKey: '',
          url: 'https://example.com/extra-2.png',
          mediaType: 'image',
          generationId: 'gen-3',
        },
      ],
      selectGalleryItem: vi.fn(),
      selectGalleryItems: vi.fn(),
      deselectGalleryItems: vi.fn(),
      clearGallerySelection: vi.fn(),
    });

    render(<AgentChat timelineId="timeline-1" />);

    fireEvent.click(screen.getByTitle('Timeline Agent (Cmd+Shift+R to talk)'));

    expect(await screen.findByText('attaching 1 shot (4 images) and 2 more images')).toBeInTheDocument();
  });

  it('deselects an individual attachment from both timeline and gallery selection in the composer', async () => {
    const replaceTimelineSelection = vi.fn();
    const deselectGalleryItems = vi.fn();

    mocks.useTimelineEditorOps.mockReturnValue({
      replaceTimelineSelection,
    });
    mocks.useSelectedMediaClips.mockReturnValue({
      clips: [
        {
          clipId: 'timeline-clip-1',
          assetKey: 'asset-1',
          url: 'https://example.com/shared.png',
          mediaType: 'image',
          generationId: 'gen-1',
          shotId: 'shot-1',
          shotName: 'Hero Shot',
        },
        {
          clipId: 'timeline-clip-2',
          assetKey: 'asset-2',
          url: 'https://example.com/other.png',
          mediaType: 'image',
        },
      ],
      summary: 'attaching 2 images',
    });
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(['gallery-item-1']),
      gallerySelectionMap: new Map([
        ['gallery-item-1', {
          url: 'https://example.com/shared.png',
          mediaType: 'image',
          generationId: 'gen-1',
        }],
      ]),
      gallerySummary: 'attaching 1 image',
      selectedGalleryClips: [
        {
          clipId: 'gallery-gen-1',
          assetKey: '',
          url: 'https://example.com/shared.png',
          mediaType: 'image',
          generationId: 'gen-1',
        },
      ],
      selectGalleryItem: vi.fn(),
      selectGalleryItems: vi.fn(),
      deselectGalleryItems,
      clearGallerySelection: vi.fn(),
    });

    render(<AgentChat timelineId="timeline-1" />);

    fireEvent.click(screen.getByTitle('Timeline Agent (Cmd+Shift+R to talk)'));
    fireEvent.click(await screen.findByRole('button', { name: 'remove-1-image' }));

    expect(replaceTimelineSelection).toHaveBeenCalledWith(['timeline-clip-2']);
    expect(deselectGalleryItems).toHaveBeenCalledWith(['gallery-item-1']);
  });

  it('deselects a whole shot without clearing unrelated selected extras', async () => {
    const replaceTimelineSelection = vi.fn();
    const deselectGalleryItems = vi.fn();

    mocks.useTimelineEditorOps.mockReturnValue({
      replaceTimelineSelection,
    });
    mocks.useSelectedMediaClips.mockReturnValue({
      clips: [
        {
          clipId: 'shot-clip-1',
          assetKey: 'asset-1',
          url: 'https://example.com/shot-1.png',
          mediaType: 'image',
          generationId: 'gen-shot-1',
          shotId: 'shot-1',
          shotName: 'Hero Shot',
          shotSelectionClipCount: 2,
        },
        {
          clipId: 'shot-clip-2',
          assetKey: 'asset-2',
          url: 'https://example.com/shot-2.png',
          mediaType: 'image',
          generationId: 'gen-shot-2',
          shotId: 'shot-1',
          shotName: 'Hero Shot',
          shotSelectionClipCount: 2,
        },
        {
          clipId: 'timeline-extra',
          assetKey: 'asset-3',
          url: 'https://example.com/extra.png',
          mediaType: 'image',
        },
      ],
      summary: 'attaching 1 shot (2 images) and 1 more image',
    });
    mocks.useGallerySelection.mockReturnValue({
      selectedGalleryIds: new Set(['gallery-item-1', 'gallery-item-2']),
      gallerySelectionMap: new Map([
        ['gallery-item-1', {
          url: 'https://example.com/shot-1.png',
          mediaType: 'image',
          generationId: 'gen-shot-1',
        }],
        ['gallery-item-2', {
          url: 'https://example.com/extra-gallery.png',
          mediaType: 'image',
          generationId: 'gen-extra',
        }],
      ]),
      gallerySummary: 'attaching 2 images',
      selectedGalleryClips: [
        {
          clipId: 'gallery-gen-shot-1',
          assetKey: '',
          url: 'https://example.com/shot-1.png',
          mediaType: 'image',
          generationId: 'gen-shot-1',
        },
        {
          clipId: 'gallery-gen-extra',
          assetKey: '',
          url: 'https://example.com/extra-gallery.png',
          mediaType: 'image',
          generationId: 'gen-extra',
        },
      ],
      selectGalleryItem: vi.fn(),
      selectGalleryItems: vi.fn(),
      deselectGalleryItems,
      clearGallerySelection: vi.fn(),
    });

    render(<AgentChat timelineId="timeline-1" />);

    fireEvent.click(screen.getByTitle('Timeline Agent (Cmd+Shift+R to talk)'));
    fireEvent.click(await screen.findByRole('button', { name: 'remove-shot-shot-1' }));

    expect(replaceTimelineSelection).toHaveBeenCalledWith(['timeline-extra']);
    expect(deselectGalleryItems).toHaveBeenCalledWith(['gallery-item-1']);
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
