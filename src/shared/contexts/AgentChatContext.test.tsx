// @vitest-environment jsdom
import { useEffect } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AgentChatProvider,
  useAgentChatActions,
  useAgentChatActionsRegistry,
  useAgentChatBridge,
  useAgentChatRegistry,
  type AgentChatActionsHandlers,
} from './AgentChatContext';

// Minimal settings shim — AgentChatProvider reads videoEditorSettings via
// useToolSettings; we don't care about its value here.
vi.mock('@/shared/hooks/settings/useToolSettings', () => ({
  useToolSettings: () => ({ settings: { lastTimelineId: null } }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return <AgentChatProvider>{children}</AgentChatProvider>;
}

function makeHandlers(): AgentChatActionsHandlers {
  return {
    toggleRecording: vi.fn(),
    focusComposer: vi.fn(),
    markEngaged: vi.fn(),
  };
}

describe('AgentChatActions registry', () => {
  it('useAgentChatActions returns null before any registration', () => {
    const { result } = renderHook(() => useAgentChatActions(), { wrapper });
    expect(result.current).toBeNull();
  });

  it('returns a non-null value with published state after publishState fires', () => {
    const actionsHook = renderHook(() => useAgentChatActions(), { wrapper: undefined });

    function ProviderWithBridge({ onActions }: { onActions: (v: ReturnType<typeof useAgentChatActions>) => void }) {
      const registry = useAgentChatActionsRegistry();
      const handlers = makeHandlers();
      registry.registerHandlers(handlers);
      registry.publishState({ isRecording: true, isProcessing: false });
      const actions = useAgentChatActions();
      onActions(actions);
      return null;
    }

    const seen: Array<ReturnType<typeof useAgentChatActions>> = [];
    render(
      <AgentChatProvider>
        <ProviderWithBridge onActions={(a) => { seen.push(a); }} />
      </AgentChatProvider>,
    );

    const last = seen[seen.length - 1];
    expect(last).not.toBeNull();
    expect(last?.isRecording).toBe(true);
    expect(last?.isProcessing).toBe(false);

    // Suppress unused variable warning — actionsHook is just to assert wrapper isolation
    void actionsHook;
  });

  it('imperative methods invoke the most recently registered handlers (stale-closure resistance)', () => {
    const handlersA = makeHandlers();
    const handlersB = makeHandlers();
    let capturedActions: ReturnType<typeof useAgentChatActions> | undefined;

    function Bridge() {
      const registry = useAgentChatActionsRegistry();
      const actions = useAgentChatActions();
      capturedActions = actions;
      // First mount → register A; then immediately register B (overwrite).
      registry.registerHandlers(handlersA);
      registry.publishState({ isRecording: false, isProcessing: false });
      registry.registerHandlers(handlersB);
      return null;
    }

    render(
      <AgentChatProvider>
        <Bridge />
      </AgentChatProvider>,
    );

    expect(capturedActions).not.toBeNull();
    capturedActions?.toggleRecording();
    capturedActions?.focusComposer();
    capturedActions?.markEngaged();
    // B is the most recent registration → its handlers fire, A's don't.
    expect(handlersA.toggleRecording).not.toHaveBeenCalled();
    expect(handlersA.focusComposer).not.toHaveBeenCalled();
    expect(handlersA.markEngaged).not.toHaveBeenCalled();
    expect(handlersB.toggleRecording).toHaveBeenCalledTimes(1);
    expect(handlersB.focusComposer).toHaveBeenCalledTimes(1);
    expect(handlersB.markEngaged).toHaveBeenCalledTimes(1);
  });

  it('returns null again after unregister', () => {
    let capturedActions: ReturnType<typeof useAgentChatActions> | undefined;
    let unregisterFn: (() => void) | undefined;

    function Bridge() {
      const registry = useAgentChatActionsRegistry();
      capturedActions = useAgentChatActions();
      // Register exactly once via effect so the rerender after unregister
      // doesn't re-register.
      useEffect(() => {
        registry.registerHandlers(makeHandlers());
        registry.publishState({ isRecording: false, isProcessing: false });
        unregisterFn = registry.unregister;
      }, [registry]);
      return null;
    }

    const view = render(
      <AgentChatProvider>
        <Bridge />
      </AgentChatProvider>,
    );

    expect(capturedActions).not.toBeNull();

    act(() => {
      unregisterFn?.();
    });
    view.rerender(
      <AgentChatProvider>
        <Bridge />
      </AgentChatProvider>,
    );
    expect(capturedActions).toBeNull();
  });

  it('useAgentChatActionsRegistry throws when used outside the provider', () => {
    // Suppress React's error log for this expected error.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useAgentChatActionsRegistry())).toThrow(
      /useAgentChatActionsRegistry must be used within an AgentChatProvider/,
    );
    errSpy.mockRestore();
  });
});


describe('AgentChat editor ownership', () => {
  const value = (timelineId: string) => ({
    timelineId,
    editorContext: {
      tool: 'video-editor' as const,
      projectId: 'shared-project',
      projectSlug: 'shared-project',
      timelineId,
      timelineName: timelineId,
    },
  });

  const useBridgeAndRegistry = () => ({
    bridge: useAgentChatBridge(),
    registry: useAgentChatRegistry(),
  });

  it('background editor updates and disposal preserve the active editor and host composer', () => {
    const { result } = renderHook(useBridgeAndRegistry, { wrapper });
    const ownerA = Symbol('editor-a');
    const ownerB = Symbol('editor-b');
    let disposeB: (() => void) | undefined;
    act(() => {
      result.current.registry.register(value('timeline-a'), ownerA);
      disposeB = result.current.registry.register(value('timeline-b'), ownerB);
      result.current.bridge.requestComposerPrompt?.('Keep this host prompt');
    });
    expect(result.current.bridge.timelineId).toBe('timeline-a');
    act(() => {
      disposeB = result.current.registry.register(value('timeline-b-updated'), ownerB);
    });
    expect(result.current.bridge.timelineId).toBe('timeline-a');
    act(() => { disposeB?.(); });
    expect(result.current.bridge.editorContext?.timelineId).toBe('timeline-a');
    expect(result.current.bridge.pendingComposerPrompt).toBe('Keep this host prompt');
  });

  it('explicit activation selects an editor and active disposal resumes the remaining editor', () => {
    const { result } = renderHook(useBridgeAndRegistry, { wrapper });
    const ownerA = Symbol('same-instance-id');
    const ownerB = Symbol('same-instance-id');
    let disposeA: (() => void) | undefined;
    let disposeB: (() => void) | undefined;
    act(() => {
      disposeA = result.current.registry.register(value('timeline-a'), ownerA);
      disposeB = result.current.registry.register(value('timeline-b'), ownerB);
      result.current.registry.activate(ownerB);
    });
    expect(result.current.bridge.timelineId).toBe('timeline-b');
    act(() => { disposeB?.(); });
    expect(result.current.bridge.timelineId).toBe('timeline-a');
    act(() => { disposeA?.(); });
    expect(result.current.bridge.timelineId).toBeNull();
    expect(result.current.bridge.editorContext).toBeNull();
  });

  it('stale cleanup cannot remove a replacement or a separately owned registration', () => {
    const { result } = renderHook(useBridgeAndRegistry, { wrapper });
    const owner = Symbol('editor');
    let staleCleanup: (() => void) | undefined;
    act(() => {
      staleCleanup = result.current.registry.register(value('old-timeline'), owner);
      result.current.registry.register(value('new-timeline'), owner);
      staleCleanup();
      result.current.registry.unregister();
      result.current.registry.activate(Symbol('missing'));
    });
    expect(result.current.bridge.timelineId).toBe('new-timeline');
  });

  it('retains the legacy register/unregister behavior for a single caller', () => {
    const { result } = renderHook(useBridgeAndRegistry, { wrapper });
    act(() => { result.current.registry.register(value('legacy')); });
    expect(result.current.bridge.timelineId).toBe('legacy');
    act(() => { result.current.registry.unregister(); });
    expect(result.current.bridge.editorContext).toBeNull();
  });
});
