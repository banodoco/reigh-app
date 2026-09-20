import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { requireContextValue } from '@/shared/contexts/contextGuard';
import { useToolSettings } from '@/shared/hooks/settings/useToolSettings';
import { videoEditorSettings } from '@/tools/video-editor/settings/videoEditorDefaults';
import type { ReighAgentElementContext } from '@/tools/video-editor/runtime/element-contract.ts';
import type { AstridElementOperationAdapter } from '@/tools/video-editor/runtime/element-adapter.ts';

export type AgentChatEditorContext = {
  tool: 'video-editor';
  projectId: string | null;
  projectSlug: string | null;
  timelineId: string;
  timelineName: string | null;
  deepLink?: string | null;
  /** Compact, host-owned timeline facts for agent scope display and prompts. */
  timelineSummary?: {
    configVersion: number;
    trackCount: number;
    clipCount: number;
    assetCount: number;
    duration: number;
  };
  /** Compact, serializable Elements catalog and selected-cut context. */
  elementContext?: ReighAgentElementContext;
  /** Host-side execution boundary; deliberately omitted from serialized prompt context. */
  elementOperationAdapter?: AstridElementOperationAdapter;
};

export type AgentChatContextValue = {
  timelineId: string | null;
  editorContext: AgentChatEditorContext | null;
  /** Queue an intent for the mounted chat composer, even when its pane is closed. */
  requestComposerPrompt?: (prompt: string) => void;
  pendingComposerPrompt?: string | null;
  clearPendingComposerPrompt?: () => void;
};

type AgentChatRegistryValue = {
  register: (value: AgentChatContextValue) => void;
  unregister: () => void;
};

// AgentChatPanel-side handlers that live as long as the panel is mounted.
// `markEngaged` is the v5 engagement-flag pivot: clicking the message split button
// calls this so the auto-create-session gate can fire without writing to
// `panesStore.isTasksPaneOpen` (which would short-circuit useSlidingPane.setOpen(false)).
export type AgentChatActionsHandlers = {
  toggleRecording: () => void;
  focusComposer: () => void;
  markEngaged: () => void;
};

export type AgentChatActionsValue = {
  toggleRecording: () => void;
  focusComposer: () => void;
  markEngaged: () => void;
  isRecording: boolean;
  isProcessing: boolean;
};

export type AgentChatActionsRegistry = {
  registerHandlers: (handlers: AgentChatActionsHandlers) => void;
  publishState: (state: { isRecording: boolean; isProcessing: boolean }) => void;
  unregister: () => void;
};

const AgentChatContext = createContext<AgentChatContextValue | null>(null);
const AgentChatRegistryContext = createContext<AgentChatRegistryValue | null>(null);
const AgentChatActionsContext = createContext<AgentChatActionsValue | null>(null);
const AgentChatActionsRegistryContext = createContext<AgentChatActionsRegistry | null>(null);

/**
 * Single app-level provider. Holds a default (settings-based) value that can be
 * overridden by VideoEditorProvider via register/unregister.
 */
export function AgentChatProvider({ children }: { children: ReactNode }) {
  const { settings: videoSettings } = useToolSettings(videoEditorSettings.id);
  const [override, setOverride] = useState<AgentChatContextValue | null>(null);
  const [pendingComposerPrompt, setPendingComposerPrompt] = useState<string | null>(null);

  const requestComposerPrompt = useCallback((prompt: string) => {
    setPendingComposerPrompt(prompt);
  }, []);
  const clearPendingComposerPrompt = useCallback(() => {
    setPendingComposerPrompt(null);
  }, []);

  const defaultValue = useMemo<AgentChatContextValue>(() => ({
    timelineId: videoSettings?.lastTimelineId ?? null,
    editorContext: null,
  }), [videoSettings?.lastTimelineId]);

  const register = useCallback((value: AgentChatContextValue) => setOverride(value), []);
  const unregister = useCallback(() => setOverride(null), []);

  const registry = useMemo(() => ({ register, unregister }), [register, unregister]);

  // Actions bridge — kept in refs so registered handlers always invoke the latest
  // panel-side closures even after the AgentChatPanel re-renders. Reactive state
  // (isRecording/isProcessing) is the only thing that re-renders consumers.
  const handlersRef = useRef<AgentChatActionsHandlers | null>(null);
  const [reactiveState, setReactiveState] = useState<{ isRecording: boolean; isProcessing: boolean } | null>(null);

  const registerHandlers = useCallback((handlers: AgentChatActionsHandlers) => {
    handlersRef.current = handlers;
  }, []);
  const publishState = useCallback((state: { isRecording: boolean; isProcessing: boolean }) => {
    setReactiveState((prev) => {
      if (prev && prev.isRecording === state.isRecording && prev.isProcessing === state.isProcessing) {
        return prev;
      }
      return state;
    });
  }, []);
  const unregisterActions = useCallback(() => {
    handlersRef.current = null;
    setReactiveState(null);
  }, []);

  const actionsRegistry = useMemo<AgentChatActionsRegistry>(() => ({
    registerHandlers,
    publishState,
    unregister: unregisterActions,
  }), [registerHandlers, publishState, unregisterActions]);

  const actions = useMemo<AgentChatActionsValue | null>(() => {
    if (!reactiveState) return null;
    return {
      toggleRecording: () => handlersRef.current?.toggleRecording(),
      focusComposer: () => handlersRef.current?.focusComposer(),
      markEngaged: () => handlersRef.current?.markEngaged(),
      isRecording: reactiveState.isRecording,
      isProcessing: reactiveState.isProcessing,
    };
  }, [reactiveState]);

  const contextValue = useMemo<AgentChatContextValue>(() => ({
    ...(override ?? defaultValue),
    requestComposerPrompt,
    pendingComposerPrompt,
    clearPendingComposerPrompt,
  }), [clearPendingComposerPrompt, defaultValue, override, pendingComposerPrompt, requestComposerPrompt]);

  return (
    <AgentChatRegistryContext.Provider value={registry}>
      <AgentChatActionsRegistryContext.Provider value={actionsRegistry}>
        <AgentChatActionsContext.Provider value={actions}>
          <AgentChatContext.Provider value={contextValue}>
            {children}
          </AgentChatContext.Provider>
        </AgentChatActionsContext.Provider>
      </AgentChatActionsRegistryContext.Provider>
    </AgentChatRegistryContext.Provider>
  );
}

/** Consumed by AgentChat to read timeline state. */
export function useAgentChatBridge(): AgentChatContextValue {
  const context = useContext(AgentChatContext);
  return requireContextValue(context, 'useAgentChatBridge', 'AgentChatProvider');
}

/** Optional bridge for editor chrome that also renders in isolated host tests. */
export function useOptionalAgentChatBridge(): AgentChatContextValue | null {
  return useContext(AgentChatContext);
}

/** Consumed by VideoEditorProvider to push timeline state into the bridge. */
export function useAgentChatRegistry(): AgentChatRegistryValue {
  const context = useContext(AgentChatRegistryContext);
  return requireContextValue(context, 'useAgentChatRegistry', 'AgentChatProvider');
}

// Returns null until AgentChatPanel mounts and publishes initial state. The one
// optional bridge surface — TasksPane reads this to decide whether to render the
// split button. CLAUDE.md generally requires throwing on missing context, but the
// timing of panel mount vs. TasksPane mount makes a brief null window unavoidable.
export function useAgentChatActions(): AgentChatActionsValue | null {
  return useContext(AgentChatActionsContext);
}

// Consumed by AgentChatPanel to register itself. Throws if used outside the provider.
export function useAgentChatActionsRegistry(): AgentChatActionsRegistry {
  const context = useContext(AgentChatActionsRegistryContext);
  return requireContextValue(context, 'useAgentChatActionsRegistry', 'AgentChatProvider');
}
