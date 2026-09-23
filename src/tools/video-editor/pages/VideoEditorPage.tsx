// Layer map & invariants: docs/structure_detail/tool_video_editor.md
/**
 * Internal Reigh route adapter for the in-app video editor page.
 * Not part of the supported public SDK surface.
 */
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z, ZodType } from 'zod';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useHomeNavigation } from '@/shared/hooks/useHomeNavigation.ts';
import { isHomeToolPathActive } from '@/shared/lib/tooling/homeNavigation.ts';
import { Button } from '@/shared/components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card.tsx';
import { Skeleton } from '@/shared/components/ui/skeleton.tsx';
import { useOptionalGlobalHeaderSlot } from '@/shared/contexts/ToolPageHeaderContext.tsx';
import { toast } from '@/shared/components/ui/toast.tsx';
import {
  AstridBridgeDataProvider,
  type AstridBridgeRequestObservation,
} from '@/tools/video-editor/data/AstridBridgeDataProvider.ts';
import {
  BRIDGE_REQUEST_TIMEOUT_MS,
  bridgeHealthSchema,
  bridgeTimelinePayloadSchema,
  parseBridgePayload,
} from '@/tools/video-editor/data/bridgeContract.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import { VideoEditorProvider } from '@/tools/video-editor/contexts/VideoEditorProvider.tsx';
import { getExtensionSmokeExtension } from '@/sdk/smoke/extensionSmoke';
import { devLocalExtensions } from '@/tools/video-editor/dev/localExtensions.ts';
import {
  TRANSCRIPT_LANE_FIXTURE_PARAM,
  withTranscriptFixture,
} from '@/tools/video-editor/dev/transcript-lane/fixtureProvider.ts';
import {
  getSnapshot as getDevDisabledSnapshot,
  subscribe as subscribeDevDisabled,
} from '@/tools/video-editor/dev/devExtensionEnablement.ts';
import { useExtensionLoaderWiring } from '@/tools/video-editor/runtime/useExtensionLoaderWiring';
import { ReighVideoEditorShell } from '@/tools/video-editor/components/ReighVideoEditorShell.tsx';
import { AstridAcpSessionControls } from '@/tools/video-editor/components/AstridAcpSessionControls.tsx';
import { ProjectTimelineSelectors } from '@/shared/components/ProjectTimelineSelectors.tsx';
import { AppHeader } from '@/shared/components/AppHeader.tsx';
import {
  LOCAL_BRIDGE_BASE_URL,
  useAstridBridgeDiscovery,
} from '@/tools/video-editor/hooks/useAstridBridgeDiscovery.ts';
import {
  ASTRID_DEMO_BRIDGE_COMMAND,
  ASTRID_LOCAL_RUNTIME_START_COMMAND,
  REIGH_LOCAL_DEV_COMMAND,
} from '@/shared/lib/localAstridRuntime.ts';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider.ts';
import {
  RuntimeAuthenticationError,
  type RuntimeConnectorError,
} from '@/integrations/runtime/client.ts';
import type { SaveStatus } from '@/tools/video-editor/hooks/useTimelinePersistence.ts';
import {
  astridTimelineReadPath,
  isAstridWorkspaceV1,
} from '@/integrations/astrid/workspaceV1.ts';
import { publishLocalTestExtensionDiagnostics } from '@/app/localTestRuntime.ts';
import {
  createHostOwnedExtensionOperationalEmitter,
  dispatchExtensionOperationalEvent,
  getExtensionReleaseFlags,
  selectReleaseEnabledExtensions,
} from '@/tools/video-editor/runtime/extensionReleaseControls.ts';

type VideoEditorMode = 'local' | 'runtime';

type ProviderSelection = {
  dataProvider: DataProvider;
  projectId: string | null;
  projectSlug: string | null;
  timelineId: string;
  timelineName: string | null;
  userId: string | null;
  remountKey: string;
  runtimeReconnect?: () => Promise<void>;
};

/**
 * Dev canary gate for the `timelineOverlay` family (plan step 22).
 *
 * The overlay host is a rollout-qualification canary: it mounts only when
 * BOTH the dev build AND the explicit `?timelineOverlayCanary=1` query are
 * present. The literal `import.meta.env.DEV` guard means production builds
 * drop the branch entirely, so the query is never honored outside DEV and
 * the default (no param) stays dark even in DEV.
 */
const TIMELINE_OVERLAY_CANARY_PARAM = 'timelineOverlayCanary';

/** Keep the manual ACP lifecycle inspector out of normal editor chrome. */
const ACP_DEBUG_PARAM = 'acpDebug';

/**
 * Every page-level bridge read goes through the shared wire contract
 * (`bridgeContract.ts`) rather than a bare `as T` assertion, and every one of
 * them is bounded by the same transport deadline as the provider's requests —
 * a hung local runtime must not park the entry screen forever.
 */
async function fetchBridgeJson<Schema extends ZodType>(
  path: string,
  schema: Schema,
  what: string,
): Promise<z.infer<Schema>> {
  const response = await fetch(`${LOCAL_BRIDGE_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(BRIDGE_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Astrid bridge request failed: ${response.status} ${response.statusText}`);
  }
  return parseBridgePayload(schema, await response.json(), what);
}

/**
 * The local timeline *name* for the header/dropdown label comes from the
 * timeline GET itself (one of the three bridge routes). Selection itself is
 * URL-param driven — see `useAstridBridgeDiscovery` for the list routes.
 */
function useBridgeTimelineName(projectSlug: string | null, timelineRef: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['astrid-bridge', projectSlug, timelineRef, 'name'],
    enabled: enabled && Boolean(projectSlug) && Boolean(timelineRef),
    queryFn: async () => {
      const payload = await fetchBridgeJson(
        astridTimelineReadPath(projectSlug!, timelineRef!),
        bridgeTimelinePayloadSchema,
        'timeline read',
      );
      return typeof payload.name === 'string' ? payload.name : null;
    },
  });
}

export function RuntimeConnectorRecoveryBanner({
  error,
  onRetry,
  retrying = false,
}: {
  error: RuntimeConnectorError;
  onRetry: () => void | Promise<void>;
  retrying?: boolean;
}) {
  const authenticationFailed = error instanceof RuntimeAuthenticationError;

  return (
    <div
      className="flex items-center justify-between gap-4 border-b border-destructive/30 bg-destructive/5 px-4 py-3"
      data-testid="runtime-connector-alert"
      role="alert"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {authenticationFailed ? 'Workspace Runtime authentication failed' : 'Workspace Runtime is unavailable'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{error.recoveryAction}</p>
      </div>
      <Button type="button" size="sm" variant="outline" onClick={() => void onRetry()} disabled={retrying}>
        {retrying ? 'Retrying Runtime connection…' : 'Retry Runtime connection'}
      </Button>
    </div>
  );
}

function useVideoEditorProviderSelection({
  mode,
  localProjectSlug,
  localProjectId,
  localTimelineId,
  localTimelineName,
  runtimeProjectId,
  runtimeTimelineId,
  onBridgeRequest,
  onRuntimeError,
}: {
  mode: VideoEditorMode;
  localProjectSlug: string | null;
  localProjectId: string | null;
  localTimelineId: string | null;
  localTimelineName: string | null;
  runtimeProjectId: string | null;
  runtimeTimelineId: string | null;
  onBridgeRequest?: (event: AstridBridgeRequestObservation) => void;
  onRuntimeError?: (error: RuntimeConnectorError) => void;
}): ProviderSelection | null {
  return useMemo(() => {
    if (mode === 'runtime') {
      if (!runtimeProjectId || !runtimeTimelineId) {
        return null;
      }

      const dataProvider = new RuntimeDataProvider({
        projectId: runtimeProjectId,
        onRuntimeError,
      });

      return {
        dataProvider,
        projectId: runtimeProjectId,
        projectSlug: runtimeProjectId,
        timelineId: runtimeTimelineId,
        timelineName: runtimeTimelineId,
        // Runtime authentication is owned by the connector/proxy. Keep the
        // app user null so cloud-only catalogs cannot become a second authority.
        userId: null,
        remountKey: `runtime:${runtimeProjectId}:${runtimeTimelineId}`,
        runtimeReconnect: () => dataProvider.reconnect(),
      };
    }

    if (mode === 'local') {
      if (!localProjectSlug || !localTimelineId) {
        return null;
      }

      if (isAstridWorkspaceV1) {
        // Workspace v1 is the supported editable authority. The local
        // selectors use a human-friendly project slug, but Runtime writes
        // require the canonical project id returned by discovery.
        if (!localProjectId) {
          return null;
        }
        const dataProvider = new RuntimeDataProvider({
          projectId: localProjectId,
          onRuntimeError,
        });
        return {
          dataProvider,
          projectId: localProjectId,
          projectSlug: localProjectSlug,
          timelineId: localTimelineId,
          timelineName: localTimelineName,
          userId: null,
          remountKey: `local-runtime:${localProjectId}:${localTimelineId}`,
          runtimeReconnect: () => dataProvider.reconnect(),
        };
      }

      return {
        dataProvider: new AstridBridgeDataProvider({
          projectSlug: localProjectSlug,
          timelineRef: localTimelineId,
          timelineId: localTimelineId,
          onBridgeRequest,
        }),
        projectId: localProjectSlug,
        projectSlug: localProjectSlug,
        timelineId: localTimelineId,
        timelineName: localTimelineName,
        // No user in local mode: a fabricated id would be truthy and enable
        // the auth-gated catalog queries (effects, resources) against a
        // backend that local mode must never touch. `null` keeps them off.
        userId: null,
        remountKey: `local:${localProjectSlug}:${localTimelineId}`,
      };
    }

    return null;
  }, [
    localProjectSlug,
    localProjectId,
    localTimelineId,
    localTimelineName,
    mode,
    onBridgeRequest,
    onRuntimeError,
    runtimeProjectId,
    runtimeTimelineId,
  ]);
}

export default function VideoEditorPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- Reviewed extension bundle + smoke wiring ----------------------------
  // Production defaults closed and can only be enabled by the deployment-owned
  // runtime document loaded before React mounts. DEV defaults open for authoring. URL or browser
  // storage cannot override the production rollout contract.
  //
  // Dev-local enablement is an external store (`devExtensionEnablement.ts`):
  // subscribing via useSyncExternalStore makes the disabled-ID snapshot part of
  // this component's render inputs, so a toggle in the ExtensionManager updates
  // the direct-extension memo below without a searchParams change or a loader
  // refresh key. The snapshot is a stable cached Set — unchanged reads never
  // re-render the page, and disabling an extension drops it from the list, which
  // tears its runtime lifecycle down (the lifecycle host disposes on removal).
  const devDisabledIds = useSyncExternalStore(
    subscribeDevDisabled,
    getDevDisabledSnapshot,
    getDevDisabledSnapshot,
  );

  const extensionReleaseFlags = getExtensionReleaseFlags({ development: import.meta.env.DEV });
  const bridgeOperationalEmitter = useMemo(
    () => createHostOwnedExtensionOperationalEmitter({
      releaseRevision: extensionReleaseFlags.configurationRevision,
      extensionVersions: new Map(),
    }, dispatchExtensionOperationalEvent),
    [extensionReleaseFlags.configurationRevision],
  );
  const onBridgeRequest = useCallback((observation: AstridBridgeRequestObservation) => {
    if (!extensionReleaseFlags.extensionHostEnabled) return;
    bridgeOperationalEmitter.emit({
      event: 'bridge.request',
      outcome: observation.outcome,
      durationMs: observation.durationMs,
      ...(observation.errorClass ? { errorClass: observation.errorClass } : {}),
    });
  }, [bridgeOperationalEmitter, extensionReleaseFlags.extensionHostEnabled]);

  const smokeDirectExtensions = useMemo(() => {
    const smokeExt = import.meta.env.DEV ? getExtensionSmokeExtension(searchParams) : null;
    const disabled = import.meta.env.DEV ? devDisabledIds : new Set<string>();
    // Arbitrary scratchpad manifests remain usable in DEV. Production alone
    // applies the frozen reviewed inventory in addition to the runtime flags.
    const releaseEnabledExtensions = (
      import.meta.env.DEV
        ? devLocalExtensions
        : selectReleaseEnabledExtensions(devLocalExtensions, extensionReleaseFlags)
    ).filter((extension) => !disabled.has(extension.manifest.id as string));
    const direct = [
      ...(extensionReleaseFlags.extensionHostEnabled && smokeExt ? [smokeExt] : []),
      ...releaseEnabledExtensions,
    ];
    return direct.length > 0 ? direct : undefined;
  }, [
    searchParams,
    devDisabledIds,
    extensionReleaseFlags.extensionHostEnabled,
    extensionReleaseFlags.transcriptCaptionFoundryEnabled,
    extensionReleaseFlags.runawayTypedTimelineEnabled,
  ]);

  // ---- Timeline-overlay host gate -----------------------------------------
  // An enabled, reviewed overlay contribution turns on the host in every
  // environment. The URL canary remains DEV-only and cannot bypass the parent
  // deployment kill switch.
  const timelineOverlaysEnabled = extensionReleaseFlags.extensionHostEnabled && (
    (import.meta.env.DEV && searchParams.get(TIMELINE_OVERLAY_CANARY_PARAM) === '1')
    || (smokeDirectExtensions ?? []).some((ext) => (
      ext.manifest.contributions?.some((contribution) => contribution.kind === 'timelineOverlay')
    ))
  );

  // ---- M14: extension loader wiring (host-owned) --------------------------
  // Resolves direct-local extensions + optional repository state through the
  // ExtensionLoader pipeline.  When no repository is provided, direct-local
  // extensions pass through unchanged (backward compatible).
  const {
    resolvedExtensions,
    diagnostics: loaderDiagnostics,
    isResolving: loaderIsResolving,
  } = useExtensionLoaderWiring({
    directExtensions: smokeDirectExtensions,
    repository: null,
    bundleStore: null,
  });
  useEffect(() => {
    publishLocalTestExtensionDiagnostics('loader', loaderDiagnostics);
  }, [loaderDiagnostics]);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { navigateHome, targetPath } = useHomeNavigation();
  const globalHeaderSlot = useOptionalGlobalHeaderSlot();
  const hasGlobalHeader = globalHeaderSlot.hasProvider;

  // Runtime mode is an explicit authenticated connector entry. It remains
  // separate from the normal Astrid bridge route because it uses a different
  // transport, not a different project authority.
  const runtimeProjectId = searchParams.get('runtimeProject');
  const runtimeTimelineId = searchParams.get('runtimeTimeline');
  const runtimeMode = searchParams.get('runtime') === '1';
  const acpDebugEnabled = runtimeMode && searchParams.get(ACP_DEBUG_PARAM) === '1';
  const localProjectSlug = searchParams.get('localProject');
  const localTimelineId = searchParams.get('localTimeline');
  const mode: VideoEditorMode = runtimeMode
    ? 'runtime'
    : 'local';
  const isHomeTool = isHomeToolPathActive(pathname, targetPath);

  // Selector dropdown open state drives discovery refetch-on-open + polling.
  const [selectorsOpen, setSelectorsOpen] = useState(false);
  const discovery = useAstridBridgeDiscovery({
    open: selectorsOpen,
    currentLocal: mode === 'local',
    selectedProjectSlug: localProjectSlug,
    onBridgeRequest,
  });

  const localProjectId = discovery.projectsQuery.data?.projects?.find(
    (project) => project.slug === localProjectSlug,
  )?.project_id ?? null;

  const [mountedSaveStatus, setMountedSaveStatus] = useState<SaveStatus>('saved');
  const [settingPrimaryTimelineId, setSettingPrimaryTimelineId] = useState<string | null>(null);
  const [runtimeConnectorError, setRuntimeConnectorError] = useState<RuntimeConnectorError | null>(null);
  const [runtimeRetrying, setRuntimeRetrying] = useState(false);
  const onRuntimeError = useCallback((error: RuntimeConnectorError) => {
    setRuntimeConnectorError(error);
    setRuntimeRetrying(false);
  }, []);
  const bridgeTimelineName = useBridgeTimelineName(localProjectSlug, localTimelineId, mode === 'local');
  const localTimelineName = bridgeTimelineName.data ?? null;
  const providerSelection = useVideoEditorProviderSelection({
    mode,
    localProjectSlug,
    localProjectId,
    localTimelineId,
    localTimelineName,
    runtimeProjectId,
    runtimeTimelineId,
    onBridgeRequest,
    onRuntimeError: mode === 'runtime' || (mode === 'local' && isAstridWorkspaceV1)
      ? onRuntimeError
      : undefined,
  });

  // dataKind V1 golden path (groken round 4): DEV-only fixture provider so the
  // transcript-lane example paints on any project with a media clip. Opt-in
  // via `?transcriptLaneFixture=1`; production builds drop the branch.
  const pageDataProvider = useMemo(() => {
    if (!providerSelection) return null;
    if (!import.meta.env.DEV) return providerSelection.dataProvider;
    const fixtureMode = new URLSearchParams(window.location.search).get(TRANSCRIPT_LANE_FIXTURE_PARAM);
    return fixtureMode !== null
      ? withTranscriptFixture(providerSelection.dataProvider, {
          dense: fixtureMode === 'dense',
          renderMatrix: fixtureMode === 'render-matrix',
        })
      : providerSelection.dataProvider;
  }, [providerSelection]);

  useEffect(() => {
    setRuntimeConnectorError(null);
    setRuntimeRetrying(false);
  }, [mode, providerSelection?.remountKey]);

  const handleRuntimeRetry = useCallback(async () => {
    if (runtimeRetrying || !providerSelection?.runtimeReconnect) {
      return;
    }
    setRuntimeRetrying(true);
    try {
      await providerSelection.runtimeReconnect();
      setRuntimeConnectorError(null);
    } catch {
      // RuntimeDataProvider reports the typed failure through onRuntimeError.
    } finally {
      setRuntimeRetrying(false);
    }
  }, [providerSelection, runtimeRetrying]);

  useEffect(() => {
    setMountedSaveStatus('saved');
  }, [providerSelection?.remountKey]);

  const isSwitchBlockedBySave = mountedSaveStatus === 'saving' || mountedSaveStatus === 'retrying';
  const confirmEditorRemount = useCallback(() => {
    if (!providerSelection) {
      return true;
    }
    // A save round-trip is in flight or a transport retry is scheduled —
    // switching would abandon it and lose the edit. Block like `saving`.
    if (mountedSaveStatus === 'saving' || mountedSaveStatus === 'retrying') {
      return false;
    }
    if (mountedSaveStatus === 'dirty') {
      return window.confirm('You have unsaved timeline changes. Switch editors and discard them?');
    }
    if (mountedSaveStatus === 'error') {
      return window.confirm('The last timeline save failed. Switch editors anyway?');
    }
    return true;
  }, [mountedSaveStatus, providerSelection]);

  const handleSelectProject = useCallback((slug: string) => {
    if (!slug || slug === localProjectSlug) {
      return;
    }
    if (!confirmEditorRemount()) {
      return;
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('localProject', slug);
      next.delete('localTimeline');
      return next;
    }, { replace: true });
  }, [confirmEditorRemount, localProjectSlug, setSearchParams]);

  const handleSelectTimeline = useCallback((timelineId: string) => {
    if (!timelineId || timelineId === localTimelineId) {
      return;
    }
    if (!confirmEditorRemount()) {
      return;
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('localTimeline', timelineId);
      return next;
    }, { replace: true });
  }, [confirmEditorRemount, localTimelineId, setSearchParams]);

  const handleSetPrimaryTimeline = useCallback(async (timelineId: string) => {
    if (!providerSelection?.dataProvider.setPrimaryTimeline || !timelineId) {
      return;
    }
    setSettingPrimaryTimelineId(timelineId);
    try {
      await providerSelection.dataProvider.setPrimaryTimeline(timelineId);
      await Promise.all([
        discovery.projectsQuery.refetch(),
        discovery.timelinesQuery.refetch(),
      ]);
      toast.success('Primary timeline updated');
    } catch (error) {
      console.error('[video-editor] Failed to set primary timeline', error);
      toast.error('Failed to set the primary timeline');
    } finally {
      setSettingPrimaryTimelineId(null);
    }
  }, [discovery.projectsQuery, discovery.timelinesQuery, providerSelection]);

  // Local timeline auto-pick: when a local project is selected without a
  // timeline (or the current one no longer exists under that project), retain
  // the current id if it is still valid. Runtime v1 has projects whose stored
  // default still points at an old reference document, so prefer the explicit
  // default only when present, then the canonical `main`, then a named
  // `rough-cut`, before falling back to the first timeline.
  useEffect(() => {
    if (mode !== 'local' || !localProjectSlug) {
      return;
    }
    const localTimelines = discovery.timelinesQuery.data?.timelines;
    if (discovery.timelinesQuery.isLoading || discovery.timelinesQuery.error || !localTimelines) {
      return;
    }
    if (localTimelines.length === 0) {
      return;
    }
    // The URL may carry either the canonical id or its ULID alias (the
    // dropdown selects `timeline_ulid ?? timeline_id`), so validate against both.
    if (localTimelineId && localTimelines.some((timeline) => (
      timeline.timeline_id === localTimelineId || timeline.timeline_ulid === localTimelineId
    ))) {
      return;
    }
    // Runtime v1 currently does not populate `is_default` for every existing
    // Astrid document. Prefer the explicit default, then the canonical `main`
    // slug, then a project-level rough cut, before falling back to the first
    // available document. This keeps reference/source timelines from winning
    // merely because they were created first.
    const nextTimeline = localTimelines.find((timeline) => timeline.is_default)
      ?? localTimelines.find((timeline) => timeline.slug === 'main')
      ?? localTimelines.find((timeline) => timeline.slug === 'rough-cut')
      ?? localTimelines[0];
    if (!nextTimeline) {
      return;
    }
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('localProject', localProjectSlug);
      // Prefer the ULID: it is the routable address for bridge requests,
      // while the canonical timeline_id is identity only.
      next.set('localTimeline', nextTimeline.timeline_ulid ?? nextTimeline.timeline_id);
      return next;
    }, { replace: true });
  }, [
    discovery.timelinesQuery.data,
    discovery.timelinesQuery.error,
    discovery.timelinesQuery.isLoading,
    localProjectSlug,
    localTimelineId,
    mode,
    setSearchParams,
  ]);

  const selectors = useMemo(() => (
    <ProjectTimelineSelectors
      localProjectSlug={localProjectSlug}
      localTimelineId={localTimelineId}
      localTimelineName={localTimelineName}
      discovery={discovery}
      onSelectProject={handleSelectProject}
      onSelectTimeline={handleSelectTimeline}
      onSetPrimaryTimeline={handleSetPrimaryTimeline}
      settingPrimaryTimelineId={settingPrimaryTimelineId}
      disabled={isSwitchBlockedBySave}
      showProjectSelector={!hasGlobalHeader}
      onOpenChange={setSelectorsOpen}
    />
  ), [
    discovery.bridgeDown,
    discovery.healthQuery.error,
    discovery.healthQuery.isLoading,
    discovery.projectsQuery.data,
    discovery.projectsQuery.isLoading,
    discovery.timelinesQuery.data,
    discovery.timelinesQuery.isLoading,
    handleSelectProject,
    handleSelectTimeline,
    handleSetPrimaryTimeline,
    hasGlobalHeader,
    isSwitchBlockedBySave,
    localProjectSlug,
    localTimelineId,
    localTimelineName,
    settingPrimaryTimelineId,
  ]);

  const runtimeSelectors = (
    <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground" data-testid="runtime-project-timeline">
      <span className="rounded-md border border-border/70 bg-card/80 px-2 py-1">Runtime</span>
      <span className="truncate" title={runtimeProjectId ?? undefined}>{runtimeProjectId ?? 'No project'}</span>
      <span aria-hidden="true">/</span>
      <span className="truncate" title={runtimeTimelineId ?? undefined}>{runtimeTimelineId ?? 'No timeline'}</span>
    </div>
  );

  const localNavigationControls = useMemo(() => (
    <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
      <div className="min-w-0 flex-1">{selectors}</div>
    </div>
  ), [selectors]);
  // Keep the Runtime identity selector in the normal header. The chat owns its
  // ACP lifecycle lazily; the manual controls are only a deliberate debug
  // escape hatch because they create a separate, non-chat connection.
  const runtimeNavigationControls = useMemo(() => (
    <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
      <div className="min-w-0 flex-1">{runtimeSelectors}</div>
      <AstridAcpSessionControls enabled={acpDebugEnabled} />
    </div>
  ), [acpDebugEnabled, runtimeProjectId, runtimeTimelineId]);

  // Loaded editor chrome owns the project/timeline controls. Keep the shared
  // app header free of editor selectors so the same selector is not rendered
  // in two places.
  const globalHeaderControls = null;

  useEffect(() => {
    if (!hasGlobalHeader) {
      return;
    }
    globalHeaderSlot.setGlobalHeaderContent(globalHeaderControls);
    return () => globalHeaderSlot.clearGlobalHeaderContent();
  }, [globalHeaderControls, globalHeaderSlot.clearGlobalHeaderContent, globalHeaderSlot.setGlobalHeaderContent, hasGlobalHeader]);

  const editorNavigationControls = mode === 'runtime'
    ? runtimeNavigationControls
    : localNavigationControls;
  const headerNavigationControls = mode === 'runtime'
    ? runtimeNavigationControls
    : localNavigationControls;
  const headerTimelineName = mode === 'runtime'
    ? runtimeTimelineId
    : (localTimelineName ?? localTimelineId);

  // The same header is used for the loaded editor and every page-level
  // fallback, so switching between loading, empty, and editing states does
  // not change the navigation chrome.
  const selectorsHeader = !hasGlobalHeader ? (
    <AppHeader
      navigationMode={isHomeTool ? 'tools' : 'home'}
      onNavigate={navigateHome}
      navigationControls={headerNavigationControls}
      timelineName={headerTimelineName}
      showProjectControls={false}
    />
  ) : null;

  if (mode === 'runtime') {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-background">
        {runtimeConnectorError && (
          <RuntimeConnectorRecoveryBanner
            error={runtimeConnectorError}
            onRetry={handleRuntimeRetry}
            retrying={runtimeRetrying}
          />
        )}
        {providerSelection ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <VideoEditorProvider
              key={providerSelection.remountKey}
              dataProvider={pageDataProvider ?? providerSelection.dataProvider}
              projectId={providerSelection.projectId}
              projectSlug={providerSelection.projectSlug}
              timelineId={providerSelection.timelineId}
              timelineName={providerSelection.timelineName}
              userId={providerSelection.userId}
              onSaveStatusChange={setMountedSaveStatus}
              extensions={resolvedExtensions}
              timelineOverlaysEnabled={timelineOverlaysEnabled}
              extensionHostEnabled={extensionReleaseFlags.extensionHostEnabled}
              extensionReleaseRevision={extensionReleaseFlags.configurationRevision}
            >
              <ReighVideoEditorShell
                mode="full"
                timelineId={providerSelection.timelineId}
                onCreateTimeline={() => navigate('/')}
                navigationControls={editorNavigationControls}
                navigationMode={isHomeTool ? 'tools' : 'home'}
                showHeader={!hasGlobalHeader}
              />
            </VideoEditorProvider>
          </div>
        ) : (
          <>
            {selectorsHeader}
            <div className="flex flex-1 items-center justify-center px-6">
              <Card className="w-full max-w-md">
                <CardHeader>
                  <CardTitle>Select a Runtime timeline</CardTitle>
                  <CardDescription>Open this R1 path with runtime=1, runtimeProject, and runtimeTimeline.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Configure the authenticated Runtime connector with <code>VITE_WORKSPACE_RUNTIME_URL</code> or use the
                    default <code>/api/runtime</code> proxy, then retry.
                  </p>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    );
  }

  if (mode === 'local') {
    const projectDiscoveryPending = Boolean(localProjectSlug)
      && (
        discovery.healthQuery.isLoading
        || discovery.projectsQuery.isLoading
        || (
          !discovery.projectsQuery.data
          && !discovery.projectsQuery.error
        )
      );

    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-background">
        {providerSelection ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <VideoEditorProvider
              key={providerSelection.remountKey}
              dataProvider={pageDataProvider ?? providerSelection.dataProvider}
              projectId={providerSelection.projectId}
              projectSlug={providerSelection.projectSlug}
              timelineId={providerSelection.timelineId}
              timelineName={providerSelection.timelineName}
              userId={providerSelection.userId}
              onSaveStatusChange={setMountedSaveStatus}
              extensions={resolvedExtensions}
              timelineOverlaysEnabled={timelineOverlaysEnabled}
              extensionHostEnabled={extensionReleaseFlags.extensionHostEnabled}
              extensionReleaseRevision={extensionReleaseFlags.configurationRevision}
            >
              <ReighVideoEditorShell
                mode="full"
                timelineId={providerSelection.timelineId}
                onCreateTimeline={() => navigate('/')}
                navigationControls={editorNavigationControls}
                navigationMode={isHomeTool ? 'tools' : 'home'}
                showHeader={!hasGlobalHeader}
              />
            </VideoEditorProvider>
          </div>
        ) : (
          <>
            {selectorsHeader}
            <div className="flex flex-1 items-center justify-center px-6">
              {discovery.healthQuery.isLoading ? (
                <div className="w-full max-w-4xl space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : discovery.bridgeDown ? (
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>Unable to connect to the local Astrid workspace</CardTitle>
                    <CardDescription>
                      {discovery.healthQuery.error?.message ?? 'The Astrid bridge did not report healthy.'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      From the Reigh checkout, start the installed Astrid runtime:
                    </p>
                    <code className="mt-2 block rounded bg-muted px-2 py-1 text-xs">
                      {ASTRID_LOCAL_RUNTIME_START_COMMAND}
                    </code>
                    <p className="mt-3 text-sm text-muted-foreground">
                      Then start Reigh with the discovered runtime connection:
                    </p>
                    <code className="mt-2 block rounded bg-muted px-2 py-1 text-xs">
                      {REIGH_LOCAL_DEV_COMMAND}
                    </code>
                    <p className="mt-3 text-sm text-muted-foreground">
                      For the bundled demo only:
                    </p>
                    <code className="mt-2 block rounded bg-muted px-2 py-1 text-xs">
                      {ASTRID_DEMO_BRIDGE_COMMAND}
                    </code>
                  </CardContent>
                </Card>
              ) : !localProjectSlug || !localTimelineId ? (
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>Select a project and timeline</CardTitle>
                    <CardDescription>
                      Use the selectors above to open a timeline from the local Astrid bridge.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : projectDiscoveryPending ? (
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>Loading timeline</CardTitle>
                    <CardDescription>Resolving this project in the Astrid workspace.</CardDescription>
                  </CardHeader>
                </Card>
              ) : (
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>Timeline not found</CardTitle>
                    <CardDescription>No such project/timeline under the bridge projects root.</CardDescription>
                  </CardHeader>
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

}
