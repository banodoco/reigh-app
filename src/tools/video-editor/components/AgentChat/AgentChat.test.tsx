// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentTurn } from '@/tools/video-editor/types/agent-session';
import { AgentChatPanel } from './AgentChat';

const mocks = vi.hoisted(() => ({
  useAgentChatBridge: vi.fn(),
  useAgentChatActionsRegistry: vi.fn(),
  useVideoEditorRuntime: vi.fn(),
  useAgentSessions: vi.fn(),
  useProjectChat: vi.fn(),
  useSaveProjectDraft: vi.fn(),
  useSelectProjectSession: vi.fn(),
  useUnassignedProjectSessions: vi.fn(),
  useAssociateProjectSession: vi.fn(),
  useCreateSession: vi.fn(),
  useAgentSession: vi.fn(),
  useSendMessage: vi.fn(),
  useCancelSession: vi.fn(),
  useCurrentAttachmentSet: vi.fn(),
  composerRemoveAttachment: vi.fn(),
  composerClearAttachments: vi.fn(),
  useAgentVoice: vi.fn(),
  loadGenerationForLightbox: vi.fn(),
  agentSessionsAvailable: true,
  // Mutable so individual tests can flip isTasksPaneLocked to satisfy the
  // engagement gate that drives auto-create.
  panesState: { isTasksPaneLocked: false },
}));

vi.mock('@/shared/contexts/AgentChatContext', () => ({
  useAgentChatBridge: (...args: unknown[]) => mocks.useAgentChatBridge(...args),
  useAgentChatActionsRegistry: (...args: unknown[]) => mocks.useAgentChatActionsRegistry(...args),
}));

vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext', () => ({
  useVideoEditorRuntime: (...args: unknown[]) => mocks.useVideoEditorRuntime(...args),
}));

vi.mock('@/tools/video-editor/hooks/useAgentSession', () => ({
  isTimelineAgentSessionsAvailable: () => mocks.agentSessionsAvailable,
  useAgentSessions: (...args: unknown[]) => mocks.useAgentSessions(...args),
  useProjectChat: (...args: unknown[]) => mocks.useProjectChat(...args),
  useSaveProjectDraft: (...args: unknown[]) => mocks.useSaveProjectDraft(...args),
  useSelectProjectSession: (...args: unknown[]) => mocks.useSelectProjectSession(...args),
  useUnassignedProjectSessions: (...args: unknown[]) => mocks.useUnassignedProjectSessions(...args),
  useAssociateProjectSession: (...args: unknown[]) => mocks.useAssociateProjectSession(...args),
  useCreateSession: (...args: unknown[]) => mocks.useCreateSession(...args),
  useAgentSession: (...args: unknown[]) => mocks.useAgentSession(...args),
  useSendMessage: (...args: unknown[]) => mocks.useSendMessage(...args),
  useCancelSession: (...args: unknown[]) => mocks.useCancelSession(...args),
}));

vi.mock('@/shared/state/selectionStore', () => ({
  composerRemoveAttachment: (...args: unknown[]) => mocks.composerRemoveAttachment(...args),
  composerClearAttachments: (...args: unknown[]) => mocks.composerClearAttachments(...args),
}));

vi.mock('@/shared/state/currentAttachmentSet', () => ({
  useCurrentAttachmentSet: (...args: unknown[]) => mocks.useCurrentAttachmentSet(...args),
}));

vi.mock('@/shared/state/panesStore', () => ({
  // AgentChatPanel only reads isTasksPaneLocked now (used as an engagement signal).
  usePanesStore: (selector: (state: { isTasksPaneLocked: boolean }) => unknown) =>
    selector({ isTasksPaneLocked: mocks.panesState.isTasksPaneLocked }),
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
    onRemoveAttachment,
    onRemoveShot,
  }: {
    attachments: Array<{ clipId: string; shotId?: string }>;
    onRemoveAttachment?: (attachment: { clipId: string; shotId?: string }) => void;
    onRemoveShot?: (shotId: string) => void;
  }) => (
    <div>
      {attachments.map((attachment) => (
        <button
          key={`remove-${attachment.clipId}`}
          type="button"
          onClick={() => onRemoveAttachment?.(attachment)}
        >
          {`remove-${attachment.clipId}`}
        </button>
      ))}
      {attachments
        .filter((attachment) => attachment.shotId)
        .map((attachment) => (
          <button
            key={`remove-shot-${attachment.shotId}`}
            type="button"
            onClick={() => onRemoveShot?.(attachment.shotId!)}
          >
            {`remove-shot-${attachment.shotId}`}
          </button>
        ))}
    </div>
  ),
}));

function iso(timestampMs: number) {
  return new Date(timestampMs).toISOString();
}

function createUserTurn(content: string, timestampMs: number): AgentTurn {
  return {
    role: 'user',
    content,
    timestamp: iso(timestampMs),
  };
}

function createTimelineClip(clipId: string) {
  return {
    clipId,
    assetKey: `asset-${clipId}`,
    url: `https://example.com/${clipId}.png`,
    mediaType: 'image' as const,
    isTimelineBacked: true,
  };
}

function createState() {
  return {
    timelineId: 'timeline-1' as string | null,
    timelineClips: [] as Array<ReturnType<typeof createTimelineClip>>,
    sessionsData: [{ id: 'session-1', status: 'waiting_user' }],
    activeSessionData: {
      id: 'session-1',
      status: 'waiting_user',
      turns: [] as AgentTurn[],
    },
    createSession: {
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'session-2' }),
    },
    sendMessage: {
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
      localError: null as string | null,
    },
    cancelSession: {
      mutate: vi.fn(),
      isPending: false,
    },
    voice: {
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      cancelRecording: vi.fn(),
      isRecording: false,
      isProcessing: false,
      remainingSeconds: 30,
    },
  };
}

function mockFromState(state: ReturnType<typeof createState>) {
  mocks.useVideoEditorRuntime.mockImplementation(() => ({
    mediaLightbox: {
      loadGenerationForLightbox: mocks.loadGenerationForLightbox,
      Lightbox: ({ media }: { media: { id: string } }) => <div data-testid="media-lightbox">{media.id}</div>,
    },
  }));
  mocks.useAgentChatBridge.mockImplementation(() => ({
    timelineId: state.timelineId,
  }));
  mocks.useAgentChatActionsRegistry.mockImplementation(() => ({
    registerHandlers: vi.fn(),
    publishState: vi.fn(),
    unregister: vi.fn(),
  }));
  mocks.useAgentSessions.mockImplementation(() => ({
    data: state.sessionsData,
    isLoading: false,
  }));
  mocks.useProjectChat.mockImplementation(() => ({ data: undefined, refetch: vi.fn() }));
  mocks.useSaveProjectDraft.mockImplementation(() => ({ mutateAsync: vi.fn(), isPending: false }));
  mocks.useSelectProjectSession.mockImplementation(() => ({ mutate: vi.fn(), isPending: false }));
  mocks.useUnassignedProjectSessions.mockImplementation(() => ({ data: undefined, isLoading: false }));
  mocks.useAssociateProjectSession.mockImplementation(() => ({ mutate: vi.fn(), isPending: false }));
  mocks.useCreateSession.mockImplementation(() => state.createSession);
  mocks.useAgentSession.mockImplementation(() => ({
    data: state.activeSessionData,
    isLoading: false,
  }));
  mocks.useSendMessage.mockImplementation(() => state.sendMessage);
  mocks.useCancelSession.mockImplementation(() => state.cancelSession);
  mocks.useCurrentAttachmentSet.mockImplementation(() => ({
    clips: state.timelineClips,
    summary: state.timelineClips.length > 0 ? `attaching ${state.timelineClips.length} image` : '',
  }));
  mocks.useAgentVoice.mockImplementation(() => state.voice);
}

function renderAgentChat(isExpanded = false) {
  return render(<AgentChatPanel isExpanded={isExpanded} />);
}

function rerenderAgentChat(rerender: ReturnType<typeof render>['rerender'], isExpanded = false) {
  rerender(<AgentChatPanel isExpanded={isExpanded} />);
}

async function getInput() {
  const textbox = await screen.findByRole('textbox');
  await waitFor(() => expect(textbox).not.toBeDisabled());
  return textbox;
}

async function queueMessage(textbox: HTMLElement, text: string) {
  fireEvent.change(textbox, { target: { value: text } });
  fireEvent.keyDown(textbox, { key: 'Enter' });
  await waitFor(() => expect((textbox as HTMLTextAreaElement).value).toBe(''));
}

function getQueuedTexts() {
  return Array.from(document.querySelectorAll('.line-clamp-2')).map((node) => node.textContent);
}

describe('AgentChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agentSessionsAvailable = true;
    // Default: pane is locked so the engagement gate is satisfied and the
    // existing auto-create assertions still hold. Tests that need the unengaged
    // baseline flip this back to false.
    mocks.panesState.isTasksPaneLocked = true;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    });

    mocks.loadGenerationForLightbox.mockResolvedValue({
      id: 'gen-1',
      generation_id: 'gen-1',
      location: 'https://example.com/shared.png',
      imageUrl: 'https://example.com/shared.png',
      thumbUrl: 'https://example.com/shared.png',
      type: 'image',
      primary_variant_id: null,
      name: 'Shared image',
    });
  });

  it('renders one Astrid-managed notice and never starts unavailable session work', async () => {
    mocks.agentSessionsAvailable = false;
    const state = createState();
    state.sessionsData = [];
    mockFromState(state);

    const view = renderAgentChat();
    expect(await screen.findByText('Timeline agent chat is managed in Astrid')).toBeInTheDocument();
    expect(screen.getByText(/Run the agent workflow in Astrid/)).toBeInTheDocument();

    view.rerender(<AgentChatPanel />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mocks.useAgentSessions).not.toHaveBeenCalled();
    expect(mocks.useCreateSession).not.toHaveBeenCalled();
    expect(state.createSession.mutate).not.toHaveBeenCalled();
  });

  it('shows a no-timeline prompt and does not auto-create a session even when engaged', async () => {
    const state = createState();
    state.timelineId = null;
    state.sessionsData = [];
    state.createSession = {
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    };
    mockFromState(state);

    renderAgentChat();

    expect(await screen.findByText('Select a project to start chatting.')).toBeInTheDocument();
    await waitFor(() => expect(state.createSession.mutate).not.toHaveBeenCalled());
  });

  it('shows saved-chat load failures and retries only when the user clicks Retry saved chat', async () => {
    const state = createState();
    mockFromState(state);
    const refetch = vi.fn();
    mocks.useAgentSession.mockReturnValue({ data: undefined, error: new Error('ACP session not found: saved-chat'), isFetching: false, refetch });
    renderAgentChat();
    expect(await screen.findByText('ACP session not found: saved-chat')).toBeInTheDocument();
    expect(refetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry saved chat' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('uses four composer rows in split view and eight when chat fills the pane', async () => {
    const state = createState();
    mockFromState(state);

    const view = renderAgentChat();
    const textbox = await getInput();
    expect(textbox.tagName).toBe('TEXTAREA');
    expect(textbox).toHaveAttribute('rows', '4');

    view.rerender(<AgentChatPanel isExpanded />);
    expect(await screen.findByRole('textbox')).toHaveAttribute('rows', '8');
  });

  it('auto-creates a session when the engagement gate fires (pane locked) with a timeline available', async () => {
    const state = createState();
    state.sessionsData = [];
    state.createSession = {
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'session-2' }),
    };
    mockFromState(state);

    renderAgentChat();

    await waitFor(() => expect(state.createSession.mutate).toHaveBeenCalledTimes(1));
  });

  it('keeps a pre-dispatch cancelled session eligible for normal selection', async () => {
    const state = createState();
    state.sessionsData = [
      { id: 'cancelled-session', status: 'cancelled' },
      { id: 'predispatch-cancel-session', status: 'waiting_user' },
    ];
    mockFromState(state);

    renderAgentChat();

    await waitFor(() => expect(mocks.useAgentSession).toHaveBeenCalledWith('predispatch-cancel-session'));
  });

  it('does not auto-create when unengaged (pane unlocked, no voice, no markEngaged)', async () => {
    mocks.panesState.isTasksPaneLocked = false;
    const state = createState();
    state.sessionsData = [];
    state.createSession = {
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    };
    mockFromState(state);

    renderAgentChat();

    // Give the auto-create effect time to NOT fire.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.createSession.mutate).not.toHaveBeenCalled();
  });

  it('Cmd+Shift+R is a no-op when no timeline exists', async () => {
    const state = createState();
    state.timelineId = null;
    state.sessionsData = [];
    state.voice = {
      startRecording: vi.fn(),
      stopRecording: vi.fn(),
      cancelRecording: vi.fn(),
      isRecording: false,
      isProcessing: false,
      remainingSeconds: 30,
    };
    mockFromState(state);

    renderAgentChat();

    fireEvent.keyDown(window, {
      key: 'r',
      metaKey: true,
      shiftKey: true,
    });

    expect(state.voice.startRecording).not.toHaveBeenCalled();
  });

  it('routes attachment removal through the composer intent', async () => {
    const state = createState();
    state.timelineClips = [
      createTimelineClip('clip-1'),
      createTimelineClip('clip-2'),
    ];
    mockFromState(state);

    renderAgentChat();

    fireEvent.click(screen.getByRole('button', { name: 'remove-clip-1' }));

    expect(mocks.composerRemoveAttachment).toHaveBeenCalledWith(expect.objectContaining({
      clipId: 'clip-1',
      url: 'https://example.com/clip-1.png',
      mediaType: 'image',
    }));
  });

  it('allows typing while processing and queues without sending immediately', async () => {
    const state = createState();
    state.activeSessionData.status = 'processing';
    mockFromState(state);

    renderAgentChat();

    const textbox = await getInput();
    expect(textbox).not.toBeDisabled();

    await queueMessage(textbox, 'queued while processing');

    expect(state.sendMessage.mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('queued while processing')).toBeInTheDocument();
  });

  it('auto-sends the queued head with attachments snapshotted at queue time', async () => {
    const state = createState();
    state.activeSessionData.status = 'processing';
    state.timelineClips = [createTimelineClip('clip-1')];
    mockFromState(state);

    const view = renderAgentChat();
    const textbox = await getInput();

    await queueMessage(textbox, 'send old attachment');
    expect(state.sendMessage.mutateAsync).not.toHaveBeenCalled();

    state.timelineClips = [createTimelineClip('clip-2')];
    state.activeSessionData.status = 'waiting_user';
    rerenderAgentChat(view.rerender);

    await waitFor(() => {
      expect(state.sendMessage.mutateAsync).toHaveBeenCalledWith({
        message: 'send old attachment',
        attachments: [
          expect.objectContaining({ clipId: 'clip-1' }),
        ],
      });
    });
  });

  it('does not clear optimistic state for duplicate text until a newer matching turn appears', async () => {
    const state = createState();
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(10_000);
    state.activeSessionData.status = 'processing';
    state.activeSessionData.turns = [
      createUserTurn('same text', 9_000),
    ];
    mockFromState(state);

    const view = renderAgentChat();
    const textbox = await getInput();

    await queueMessage(textbox, 'same text');
    await queueMessage(textbox, 'same text');

    state.activeSessionData.status = 'waiting_user';
    rerenderAgentChat(view.rerender);

    await waitFor(() => expect(state.sendMessage.mutateAsync).toHaveBeenCalledTimes(1));

    state.activeSessionData.turns = [
      createUserTurn('same text', 9_000),
    ];
    rerenderAgentChat(view.rerender);

    await waitFor(() => expect(state.sendMessage.mutateAsync).toHaveBeenCalledTimes(1));

    state.activeSessionData.turns = [
      createUserTurn('same text', 9_000),
      createUserTurn('same text', 10_500),
    ];
    rerenderAgentChat(view.rerender);

    await waitFor(() => expect(state.sendMessage.mutateAsync).toHaveBeenCalledTimes(2));
    dateNowSpy.mockRestore();
  });

  it('keeps a failed head queued, shows an error, and only resumes draining after the failed head is removed', async () => {
    const state = createState();
    state.activeSessionData.status = 'processing';
    state.sendMessage.mutateAsync = vi.fn().mockImplementation(async ({ message }: { message: string }) => {
      if (message === 'first queued') {
        state.sendMessage.localError = 'Send failed';
        throw new Error('Send failed');
      }

      return undefined;
    });
    mockFromState(state);

    const view = renderAgentChat();
    const textbox = await getInput();

    await queueMessage(textbox, 'first queued');
    await queueMessage(textbox, 'second queued');

    state.activeSessionData.status = 'waiting_user';
    rerenderAgentChat(view.rerender);

    await waitFor(() => expect(state.sendMessage.mutateAsync).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText('Send failed')).toBeInTheDocument());
    expect(getQueuedTexts()).toEqual(['first queued', 'second queued']);

    fireEvent.click(screen.getAllByTitle('Remove queued message')[0]);

    await waitFor(() => {
      expect(state.sendMessage.mutateAsync).toHaveBeenNthCalledWith(2, {
        message: 'second queued',
        attachments: [],
      });
    });
  });

  it('reorders and deletes queued messages in the rendered stack', async () => {
    const state = createState();
    state.activeSessionData.status = 'processing';
    mockFromState(state);

    renderAgentChat();

    const textbox = await getInput();

    await queueMessage(textbox, 'first');
    await queueMessage(textbox, 'second');
    await queueMessage(textbox, 'third');

    expect(getQueuedTexts()).toEqual(['first', 'second', 'third']);

    fireEvent.click(screen.getAllByTitle('Move queued message down')[0]);
    expect(getQueuedTexts()).toEqual(['second', 'first', 'third']);

    fireEvent.click(screen.getAllByTitle('Remove queued message')[1]);
    expect(getQueuedTexts()).toEqual(['second', 'third']);
  });
});


describe('project-only Astrid chat', () => {
  it('enables sending in a project without a timeline and forwards its explicit context', async () => {
    const state = createState();
    state.timelineId = null;
    mockFromState(state);
    const context = { tool: 'video-editor', projectId: 'project-1', projectSlug: 'first', timelineId: null, timelineName: null };
    mocks.useAgentChatBridge.mockReturnValue({ timelineId: null, editorContext: context });
    render(<AgentChatPanel isExpanded />);
    const composer = screen.getByPlaceholderText('Type or press Cmd+Shift+R to talk...');
    expect(composer).not.toBeDisabled();
    fireEvent.change(composer, { target: { value: 'Remember model B for this project' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(state.sendMessage.mutateAsync).toHaveBeenCalled());
    expect(mocks.useAgentSessions).toHaveBeenCalledWith(null, 'project-1');
    expect(mocks.useCreateSession).toHaveBeenCalledWith(null, 'project-1');
    expect(mocks.useSendMessage).toHaveBeenCalledWith('session-1', context, 'project-1');
  });
});


describe('project draft consumer ownership', () => {
  it('hydrates each project draft/queue, flushes to its original owner on switch, and reopens retained local text', async () => {
    vi.clearAllMocks();
    mocks.agentSessionsAvailable = true;
    mocks.panesState.isTasksPaneLocked = true;
    const state = createState();
    state.activeSessionData.status = 'processing';
    mockFromState(state);
    const context = (projectId: string) => ({ tool: 'video-editor' as const, projectId, projectSlug: projectId, timelineId: null, timelineName: null });
    let currentProject = 'draft-owner-a';
    mocks.useAgentChatBridge.mockImplementation(() => ({ timelineId: null, editorContext: context(currentProject) }));
    const drafts = new Map(['draft-owner-a', 'draft-owner-b'].map((projectId) => [projectId, {
      project_id: projectId, scope_key: `realm:store:${projectId}`, revision: 1,
      selected_session_id: `session-${projectId}`, sessions: [{ id: `session-${projectId}` }],
      draft: { text: `saved ${projectId}`, revision: 3, queued_messages: [
        { id: `queue-${projectId}`, text: `queued ${projectId}`, session_id: `session-${projectId}`, attachments: [] },
      ] },
    }]));
    mocks.useProjectChat.mockImplementation((projectId: string) => ({ data: drafts.get(projectId), refetch: vi.fn() }));
    mocks.useAgentSessions.mockImplementation((_timelineId: null, projectId: string) => ({ data: [{ id: `session-${projectId}`, status: 'processing' }], isLoading: false }));
    const saved: Array<{ projectId: string; text: string; queuedMessages: Array<{ session_id: string }> }> = [];
    mocks.useSaveProjectDraft.mockImplementation((projectId: string) => ({ isPending: false, mutateAsync: vi.fn(async (input: {
      expectedRevision: number; text: string; queuedMessages: Array<{ id: string; text: string; session_id: string; attachments: never[] }>;
    }) => {
      saved.push({ projectId, text: input.text, queuedMessages: input.queuedMessages });
      const previous = drafts.get(projectId)!;
      const next = { ...previous, draft: { text: input.text, revision: input.expectedRevision + 1, queued_messages: input.queuedMessages } };
      drafts.set(projectId, next); return next;
    }) }));
    const view = renderAgentChat();
    try {
      await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('saved draft-owner-a'));
      expect(getQueuedTexts()).toEqual(['queued draft-owner-a']);
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'local text for A' } });
      currentProject = 'draft-owner-b';
      rerenderAgentChat(view.rerender);
      await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('saved draft-owner-b'));
      await waitFor(() => expect(saved).toContainEqual(expect.objectContaining({ projectId: 'draft-owner-a', text: 'local text for A' })));
      expect(getQueuedTexts()).toEqual(['queued draft-owner-b']);
      expect(mocks.useSendMessage).toHaveBeenCalledWith('session-draft-owner-b', context('draft-owner-b'), 'draft-owner-b');
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'local text for B' } });
      currentProject = 'draft-owner-a';
      rerenderAgentChat(view.rerender);
      await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('local text for A'));
      await waitFor(() => expect(saved).toContainEqual(expect.objectContaining({ projectId: 'draft-owner-b', text: 'local text for B' })));
      expect(getQueuedTexts()).toEqual(['queued draft-owner-a']);
      expect(saved.every(({ projectId, queuedMessages }) => queuedMessages.every(item => item.session_id === `session-${projectId}`))).toBe(true);
      expect(state.sendMessage.mutateAsync).not.toHaveBeenCalled();
    } finally { view.unmount(); }
  });
});
