/**
 * Internal host-only provider wiring for the embed/browser host.
 * Not part of the supported public SDK surface.
 *
 * Runtime assembly (registries, extension lifecycle, proposal runtime,
 * process manager, diagnostics) is shared with VideoEditorProvider via
 * contexts/editorRuntimeAssembly.tsx; this file owns only the embed
 * specifics: stub host ports, the live permission service, the settings
 * notification registry and snapshot preload, and the fail-closed
 * extension-persistence initialization lifecycle.
 */
import { useOwnedResourceDisposal } from '@/tools/video-editor/hooks/useOwnedResourceDisposal';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLayoutEffect } from 'react';
import { createProposalPersistenceBridge, type ProposalPersistenceProvider } from '@/tools/video-editor/lib/proposal-runtime.ts';
import { useEffectRegistry } from '@/tools/video-editor/hooks/useEffectRegistry.ts';
import { type VideoEditorEffectCatalog } from '@/tools/video-editor/hooks/useEffectResources.ts';
import { type VideoEditorSequenceComponentCatalog } from '@/tools/video-editor/hooks/useSequenceResources.ts';
import type { DataProvider, ExtensionPersistenceService } from '@/tools/video-editor/data/DataProvider.ts';
import {
  VideoEditorRuntimeProvider,
  type VideoEditorRuntimeContextValue,
} from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import {
  EditorRuntimeScaffold,
  useEditorRuntimeAssembly,
  useEditorRuntimeSync,
  type EditorRuntimeAssembly,
} from '@/tools/video-editor/contexts/editorRuntimeAssembly.tsx';
import type { PackageStateInventoryEntry } from '@/tools/video-editor/runtime/extensionSurface.ts';
import type { ReighExtension } from '@reigh/editor-sdk';
import type {
  VideoEditorAuthHost,
  VideoEditorProjectHost,
  VideoEditorShotsHost,
  VideoEditorMediaLightboxHost,
  VideoEditorAgentChatHost,
  VideoEditorToastHost,
  VideoEditorTelemetryHost,
} from '@/tools/video-editor/runtime/ports.ts';
import { createLivePermissionService } from '@/tools/video-editor/runtime/livePermissions.ts';
import type { ExtensionStateRepository } from '@/tools/video-editor/runtime/extensionStateRepository';
import type { ExtensionSettingsSnapshot } from '@/tools/video-editor/runtime/extensionStateRepository';
import {
  createExtensionSettingsNotificationRegistry,
  type ExtensionSettingsNotificationRegistry,
} from '@/tools/video-editor/runtime/extensionSettingsNotification';
import type { ProcessManager } from '@/tools/video-editor/runtime/processes/ProcessManager.ts';
import type { AstridElementHost } from '@/tools/video-editor/runtime/astrid-element-host.ts';
import { INSTALLED_ASTRID_ELEMENT_HOST } from '@/tools/video-editor/runtime/astrid-element-components.tsx';
import type { TimelineEditability } from '@/tools/video-editor/lib/timeline-editability.ts';
import { INSTALLED_TIMELINE_SERVICE_HOOKS } from '@/tools/video-editor/runtime/installedTimelineHostServiceHooks.ts';
import type { TimelineHostServiceHooks } from '@/tools/video-editor/runtime/timelineHostServiceHooks.ts';

export interface EditorRuntimeProviderProps {
  dataProvider: DataProvider;
  timelineId: string;
  timelineName?: string | null;
  userId?: string | null;
  effectCatalog?: VideoEditorEffectCatalog | null;
  sequenceComponentCatalog?: VideoEditorSequenceComponentCatalog | null;
  /** Host-owned services used by timeline state; installed services by default. */
  timelineServices?: TimelineHostServiceHooks;
  runtime?: Pick<VideoEditorRuntimeContextValue, 'assetResolver' | 'exporter' | 'hostContext'>;
  extensions?: readonly ReighExtension[];
  /** Package-state inventory entries propagated from the loader (M5). */
  packageStateEntries?: readonly PackageStateInventoryEntry[];
  /** M5: Extension state repository for enable/disable persistence. */
  extensionStateRepository?: ExtensionStateRepository | null;
  /** M5: Trigger extension re-resolution after persistence writes. */
  triggerExtensionRefresh?: () => void;
  /** M6b: Host-provided process manager override. When absent, a default
   *  ProcessManager is created from the extension runtime's declared process
   *  specs. */
  processManager?: ProcessManager;
  /** T22: Provider-owned timeline-overlay feature flag. Explicitly defaults
   *  to false; hosts opt in by supplying `true`. */
  timelineOverlaysEnabled?: boolean;
  /** Host-owned clip/effect/transition resolution contract. */
  astridElementHost?: AstridElementHost;
  /** Host-owned timeline mutation policy. */
  timelineEditability?: TimelineEditability;
  /** Enables extension, proposal, command, process, and persistence services. */
  enableMutationServices?: boolean;
  /** Enables live-data registry and browser permission services. */
  enableLiveServices?: boolean;
  /** Whether render and compile-only export actions are available. */
  enableRenderExport?: boolean;
  children: ReactNode;
}

function EditorRuntimeProviderInner({
  children,
  timelineId,
  userId,
  effectCatalog,
  sequenceComponentCatalog,
  timelineServices,
  assembly,
  enableMutationServices,
  proposalPersistenceProvider,
  settingsSnapshotsRef,
  settingsNotificationRegistryRef,
  extensionStateRepository,
  projectObjects,
}: {
  children: ReactNode;
  timelineId: string;
  userId: string | null;
  effectCatalog?: VideoEditorEffectCatalog | null;
  sequenceComponentCatalog?: VideoEditorSequenceComponentCatalog | null;
  timelineServices: TimelineHostServiceHooks;
  assembly: EditorRuntimeAssembly;
  enableMutationServices: boolean;
  proposalPersistenceProvider: ProposalPersistenceProvider | null | undefined;
  settingsSnapshotsRef: React.MutableRefObject<Record<string, ExtensionSettingsSnapshot> | null>;
  settingsNotificationRegistryRef: React.MutableRefObject<ExtensionSettingsNotificationRegistry | null>;
  extensionStateRepository: ExtensionStateRepository | null | undefined;
  projectObjects?: DataProvider['projectObjects'];
}) {
  const sync = useEditorRuntimeSync({
    assembly,
    timelineServices,
    projectId: null,
    timelineId,
    projectObjects,
    catalogUserId: userId,
    effectsQueryEnabled: !effectCatalog && Boolean(userId),
    effectCatalog,
    sequenceComponentCatalog,
    proposalPersistenceProvider,
    enableMutationServices,
    eagerProposalRetry: false,
    settings: {
      repository: extensionStateRepository,
      snapshotsRef: settingsSnapshotsRef,
      notificationRegistryRef: settingsNotificationRegistryRef,
    },
  });

  // Pre-existing embed-host behavior (suspected redundant, preserved as-is):
  // a second useEffectRegistry call outside the EffectRegistryProvider, which
  // registers into a standalone throwaway registry. The scaffold's effect
  // registry bridge performs the registration that actually matters.
  useEffectRegistry(
    sync.effectsQueryData?.map((effect) => ({
      slug: effect.slug,
      code: effect.code,
    })),
    sync.effectResources.effects,
  );

  useLayoutEffect(() => {
    sync.store.getState().setMounted(true);
  }, [sync.store]);

  return (
    <EditorRuntimeScaffold assembly={assembly} sync={sync}>
      {children}
    </EditorRuntimeScaffold>
  );
}

export function EditorRuntimeProvider({
  dataProvider,
  timelineId,
  timelineName,
  userId = null,
  effectCatalog,
  sequenceComponentCatalog,
  timelineServices = INSTALLED_TIMELINE_SERVICE_HOOKS,
  runtime,
  extensions,
  packageStateEntries,
  extensionStateRepository,
  triggerExtensionRefresh,
  processManager: hostProcessManager,
  timelineOverlaysEnabled = false,
  astridElementHost = INSTALLED_ASTRID_ELEMENT_HOST,
  timelineEditability,
  enableMutationServices = true,
  enableLiveServices = true,
  enableRenderExport = true,
  children,
}: EditorRuntimeProviderProps) {
  // The permission service only exists while the host advertises live-service
  // access. A changed flag disposes the old instance through effect cleanup.
  const livePermissionServiceRef = useRef<ReturnType<typeof createLivePermissionService> | null>(null);
  if (enableLiveServices && !livePermissionServiceRef.current) {
    livePermissionServiceRef.current = createLivePermissionService();
  } else if (!enableLiveServices) {
    livePermissionServiceRef.current = null;
  }
  const livePermissionService = livePermissionServiceRef.current;
  useOwnedResourceDisposal(livePermissionService, (service) => {
    service?.getDisposeHandle().dispose();
  });

  // ---- T9: Host-visible settings notification registry (one per provider) -----
  const settingsNotificationRegistry = useMemo(
    () => enableMutationServices ? createExtensionSettingsNotificationRegistry() : null,
    [enableMutationServices],
  );
  const settingsNotificationRegistryRef = useRef<ExtensionSettingsNotificationRegistry | null>(null);
  settingsNotificationRegistryRef.current = settingsNotificationRegistry;

  const activeExtensionStateRepository = enableMutationServices
    ? extensionStateRepository
    : null;
  const activeTriggerExtensionRefresh = enableMutationServices
    ? triggerExtensionRefresh
    : undefined;
  const activeProcessManager = enableMutationServices ? hostProcessManager : undefined;

  const assembly = useEditorRuntimeAssembly({
    extensions: enableMutationServices ? extensions : [],
    packageStateEntries: enableMutationServices ? packageStateEntries : undefined,
    hostProcessManager: activeProcessManager,
    enableMutationServices,
    enableLiveData: enableLiveServices,
    enableShaderRegistry: true,
    // Embed-host feedback channel: no host toast in browser context.
    commandRegistryCallbacks: {
      onCommandFailure: (commandId, error, extensionId) => {
        console.error(`[CommandRegistry] Command "${commandId}" failed (${extensionId}): ${error.message}`);
      },
      onReservedCommand: (commandId, extensionId) => {
        console.warn(`[CommandRegistry] Reserved command "${commandId}" rejected for extension "${extensionId}".`);
      },
      onReservedKeybinding: (key, extensionId, commandId) => {
        console.warn(`[CommandRegistry] Reserved keybinding "${key}" for "${commandId}" rejected for extension "${extensionId}".`);
      },
      onDuplicateCommand: (commandId, originalExtension, conflictingExtension) => {
        console.warn(`[CommandRegistry] Command "${commandId}" already registered by "${originalExtension}". Extension "${conflictingExtension}" cannot override it.`);
      },
      onKeybindingConflict: (key, originalExtension, conflictingExtension) => {
        console.warn(`[CommandRegistry] Keybinding "${key}" already bound by "${originalExtension}". Extension "${conflictingExtension}" cannot override it.`);
      },
      onContextMenuStaleTarget: (commandId, extensionId, reason) => {
        console.warn(`[CommandRegistry] Context menu command "${commandId}" rejected for extension "${extensionId}": ${reason}`);
      },
    },
  });

  // ---- T9: Pre-load settings snapshots from repository for context factory ----
  const [settingsSnapshots, setSettingsSnapshots] = useState<
    Record<string, ExtensionSettingsSnapshot> | null
  >(null);
  const settingsSnapshotsRef = useRef<Record<string, ExtensionSettingsSnapshot> | null>(null);

  useEffect(() => {
    const repo = activeExtensionStateRepository;
    if (!repo || repo.isDisposed) {
      setSettingsSnapshots(null);
      settingsSnapshotsRef.current = null;
      return;
    }

    let cancelled = false;

    repo.getAllSettingsSnapshots().then((snapshots) => {
      if (cancelled) return;
      const byId: Record<string, ExtensionSettingsSnapshot> = {};
      for (const snap of snapshots) {
        byId[snap.extensionId] = snap;
      }
      setSettingsSnapshots(byId);
      settingsSnapshotsRef.current = byId;
    }).catch(() => {
      if (!cancelled) {
        setSettingsSnapshots(null);
        settingsSnapshotsRef.current = null;
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeExtensionStateRepository]);

  // ---- M1: Proposal persistence service lifecycle (provider-owned) ----------
  const proposalPersistenceBridgeRef = useRef<ProposalPersistenceProvider | null | undefined>(undefined);
  const [, setPersistenceInitVersion] = useState(0);

  // Track the current scope so we can detect userId / timelineId / provider
  // changes and tear down the old persistence service before creating a new
  // one.  Without this the lazy-init guard never resets and a disposed service
  // is re-used for the new scope (rework item T5-scope).
  const persistedServiceRef = useRef<ExtensionPersistenceService | null>(null);
  const scopeKeyRef = useRef<string | undefined>(undefined);
  const currentScopeKey = `${userId ?? 'unknown'}::${timelineId}::${enableMutationServices}::${!!dataProvider.createExtensionPersistenceService}`;

  if (scopeKeyRef.current !== undefined && scopeKeyRef.current !== currentScopeKey) {
    // Scope changed — reset so a fresh service is created for the new scope.
    // Disposal of the *old* service is handled by the effect cleanup below
    // (which captures the old svc in its closure), so we only null the refs here.
    persistedServiceRef.current = null;
    proposalPersistenceBridgeRef.current = undefined;
  }
  scopeKeyRef.current = currentScopeKey;

  // Lazy-initialize the persistence service when the provider supports it.
  if (
    enableMutationServices
    && !persistedServiceRef.current
    && dataProvider.createExtensionPersistenceService
  ) {
    persistedServiceRef.current = dataProvider.createExtensionPersistenceService(
      { userId: userId ?? 'unknown', timelineId },
      [],
    );
  }

  // When the provider does NOT support extension persistence, mark the bridge
  // null immediately so ProposalRuntime is created without persistence on the
  // first render.  When the provider DOES support persistence, the bridge stays
  // undefined until the initialize effect succeeds (fail-closed contract).
  if (
    proposalPersistenceBridgeRef.current === undefined
    && (!enableMutationServices || !dataProvider.createExtensionPersistenceService)
  ) {
    proposalPersistenceBridgeRef.current = null;
  }

  const persistenceInitializationRef = useRef<{
    service: ExtensionPersistenceService;
    ready: Promise<void>;
  } | null>(null);
  // Initialize once per owned service, even if React replays the effect, and
  // gate downstream readiness on success. Each effect cancels its own observer.
  useEffect(() => {
    const svc = persistedServiceRef.current;
    if (!svc) {
      // No persistence service — inner already has a null bridge.
      return;
    }

    if (persistenceInitializationRef.current?.service !== svc) {
      persistenceInitializationRef.current = { service: svc, ready: svc.initialize() };
    }
    let cancelled = false;
    persistenceInitializationRef.current.ready.then(() => {
      if (cancelled) return;
      proposalPersistenceBridgeRef.current = svc.capabilities.proposals
        ? createProposalPersistenceBridge(svc)
        : null;
      setPersistenceInitVersion((v) => v + 1);
    }).catch((err: unknown) => {
      if (cancelled) return;
      console.error(
        '[EditorRuntimeProvider] Extension persistence initialization failed:',
        err,
      );
      // Fail-closed: bridge stays undefined, so ProposalRuntime is never
      // exposed. The provider advertised persistence support but could not
      // initialize — operating without it would violate the contract.
    });

    return () => {
      cancelled = true;
    };
  }, [enableMutationServices, userId, timelineId, dataProvider]);
  useOwnedResourceDisposal(persistedServiceRef.current, (service) => service?.dispose());

  // ---- stub hosts for browser-embedded contexts that don't provide full Reigh shell ----
  const stubShotsHost = useMemo<VideoEditorShotsHost>(() => ({
    shots: undefined,
    isLoading: false,
    error: null,
    refetchShots: () => {},
    finalVideoMap: new Map(),
    dismissFinalVideo: () => {},
  }), []);

  const stubMediaLightboxHost = useMemo<VideoEditorMediaLightboxHost>(() => ({
    Lightbox: (() => null) as unknown as VideoEditorMediaLightboxHost['Lightbox'],
    loadGenerationForLightbox: async () => null,
  }), []);

  const stubAgentChatHost = useMemo<VideoEditorAgentChatHost>(() => ({
    registerTimeline: () => {},
    unregisterTimeline: () => {},
  }), []);

  const stubToastHost = useMemo<VideoEditorToastHost>(() => ({
    error: () => '',
    success: () => '',
    warning: () => '',
    info: () => '',
  }), []);

  const stubTelemetryHost = useMemo<VideoEditorTelemetryHost>(() => ({
    log: (..._args: unknown[]) => {},
    warn: (..._args: unknown[]) => {},
    error: (..._args: unknown[]) => {},
  }), []);

  const defaultAssetResolver = useMemo(() => ({
    resolveAssetUrl: async (file: string) => file,
  }), []);

  const contextValue = useMemo<VideoEditorRuntimeContextValue>(() => ({
    astridElementHost,
    provider: dataProvider,
    assetResolver: runtime?.assetResolver ?? defaultAssetResolver,
    auth: { userId } satisfies VideoEditorAuthHost,
    project: { projectId: null } satisfies VideoEditorProjectHost,
    shots: stubShotsHost,
    mediaLightbox: stubMediaLightboxHost,
    agentChat: stubAgentChatHost,
    toast: stubToastHost,
    telemetry: stubTelemetryHost,
    timelineId,
    timelineName,
    userId,
    exporter: runtime?.exporter ?? null,
    hostContext: runtime?.hostContext ?? null,
    renderExportEnabled: enableRenderExport,
    extensions: assembly.resolvedExtensionsConfig,
    extensionRuntime: assembly.extensionRuntime,
    commandRegistry: assembly.commandRegistryRef.current ?? undefined,
    agentToolRegistry: assembly.agentToolRegistryRef.current ?? undefined,
    liveSceneOperationPort: enableMutationServices ? assembly.liveSceneOperationPort : undefined,
    liveDataRegistry: enableLiveServices ? assembly.liveDataRegistryRef.current ?? undefined : undefined,
    livePermissionService: livePermissionService ?? undefined,
    diagnosticCollection: assembly.diagnosticCollectionRef.current ?? undefined,
    extensionStateRepository: activeExtensionStateRepository ?? null,
    triggerExtensionRefresh: activeTriggerExtensionRefresh,
    settingsNotificationRegistry: settingsNotificationRegistryRef.current ?? undefined,
    getRecoveryKey: enableMutationServices ? assembly.getRecoveryKey : undefined,
    incrementRecoveryKey: enableMutationServices ? assembly.incrementRecoveryKey : undefined,
    processManager: assembly.processManagerRef.current ?? undefined,
    processStatuses: assembly.processStatuses,
    processResultAttachRecords: enableMutationServices && assembly.processResultAttachRecords.length > 0
      ? assembly.processResultAttachRecords
      : undefined,
    recordProcessResultAttach: enableMutationServices ? assembly.recordProcessResultAttach : undefined,
    timelineOverlaysEnabled,
    timelineEditability,
    timelineViewStore: assembly.timelineViewStoreRef.current ?? undefined,
  }), [
    astridElementHost,
    dataProvider,
    runtime?.assetResolver,
    runtime?.exporter,
    runtime?.hostContext,
    enableRenderExport,
    userId,
    stubShotsHost,
    stubMediaLightboxHost,
    stubAgentChatHost,
    stubToastHost,
    stubTelemetryHost,
    defaultAssetResolver,
    timelineId,
    timelineName,
    assembly.resolvedExtensionsConfig,
    assembly.extensionRuntime,
    enableMutationServices,
    enableLiveServices,
    livePermissionService,
    activeExtensionStateRepository,
    activeTriggerExtensionRefresh,
    assembly.processResultAttachRecords,
    assembly.processStatuses,
    assembly.recordProcessResultAttach,
    assembly.getRecoveryKey,
    assembly.incrementRecoveryKey,
    timelineOverlaysEnabled,
    timelineEditability,
    assembly.liveDataRegistryRef.current,
  ]);

  return (
    <VideoEditorRuntimeProvider value={contextValue}>
      <EditorRuntimeProviderInner
        userId={userId}
        timelineId={timelineId}
        effectCatalog={effectCatalog}
        sequenceComponentCatalog={sequenceComponentCatalog}
        timelineServices={timelineServices}
        assembly={assembly}
        enableMutationServices={enableMutationServices}
        proposalPersistenceProvider={proposalPersistenceBridgeRef.current}
        settingsSnapshotsRef={settingsSnapshotsRef}
        settingsNotificationRegistryRef={settingsNotificationRegistryRef}
        extensionStateRepository={activeExtensionStateRepository}
        projectObjects={dataProvider.projectObjects}
      >
        {children}
      </EditorRuntimeProviderInner>
    </VideoEditorRuntimeProvider>
  );
}
