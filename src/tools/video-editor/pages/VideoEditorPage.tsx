import { useNativeEditorRecovery } from '../hooks/useNativeEditorRecovery.ts';
import { assertNativeEditorConnection } from "@/integrations/astrid/nativeEditorConnection.ts";
import { dispatchAppEvent } from "@/shared/lib/typedEvents.ts";
import type { ExtensionPendingWorkState } from "@/sdk/context.ts";
import {
  useRuntimeEditorDiscovery,
  chooseRuntimeTimeline,
} from "../hooks/useRuntimeEditorDiscovery.ts";
// Layer map & invariants: docs/structure_detail/tool_video_editor.md
/**
 * Internal Astrid App route adapter for the in-app video editor page.
 * Not part of the supported public SDK surface.
 */
import { resolveRuntimeProjectId } from "@/integrations/runtime/resolveProjectSelector.ts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import type { z, ZodType } from "zod";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useHomeNavigation } from "@/shared/hooks/useHomeNavigation.ts";
import { isHomeToolPathActive } from "@/shared/lib/tooling/homeNavigation.ts";
import { Button } from "@/shared/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/shared/components/ui/card.tsx";
import { Skeleton } from "@/shared/components/ui/skeleton.tsx";
import { useOptionalAgentChatRegistry } from "@/shared/contexts/AgentChatContext.tsx";
import { useOptionalGlobalHeaderSlot } from "@/shared/contexts/ToolPageHeaderContext.tsx";
import { toast } from "@/shared/components/ui/toast.tsx";
import {
  AstridBridgeDataProvider,
  type AstridBridgeRequestObservation,
} from "@/tools/video-editor/data/AstridBridgeDataProvider.ts";
import {
  BRIDGE_REQUEST_TIMEOUT_MS,
  bridgeHealthSchema,
  bridgeTimelinePayloadSchema,
  parseBridgePayload,
} from "@/tools/video-editor/data/bridgeContract.ts";
import type { DataProvider } from "@/tools/video-editor/data/DataProvider.ts";
import { VideoEditorProvider } from "@/tools/video-editor/contexts/VideoEditorProvider.tsx";
import { devLocalExtensions } from "@/tools/video-editor/dev/localExtensions.ts";
import {
  TRANSCRIPT_LANE_FIXTURE_PARAM,
  withTranscriptFixture,
} from "@/tools/video-editor/dev/transcript-lane/fixtureProvider.ts";
import {
  getSnapshot as getDevDisabledSnapshot,
  subscribe as subscribeDevDisabled,
} from "@/tools/video-editor/dev/devExtensionEnablement.ts";
import { useExtensionLoaderWiring } from "@/tools/video-editor/runtime/useExtensionLoaderWiring";
import { AstridVideoEditorShell } from "@/tools/video-editor/components/AstridVideoEditorShell.tsx";
import { AstridAcpSessionControls } from "@/tools/video-editor/components/AstridAcpSessionControls.tsx";
import {
  ProjectTimelineSelectors,
  ProjectTimelinePicker,
} from "@/shared/components/ProjectTimelineSelectors.tsx";
import { ProjectHeaderActions } from "@/shared/components/ProjectHeaderActions.tsx";
import { MinkCircle } from "@/pages/Home/components/MinkCircle/MinkCircle.tsx";
import {
  AstridRuntimeClient,
  RuntimeAuthenticationError,
  RuntimeUnavailableError,
  type RuntimeConnectorError,
} from "@/integrations/runtime/client.ts";
import {
  createCanonicalTimeline,
  ensureProjectHasTimeline,
} from "@/integrations/runtime/createDefaultTimeline.ts";
import { ApiError } from "@/integrations/runtime/generated.ts";
import { generateUUID } from "@/shared/lib/taskCreation/ids.ts";
import { AppHeader } from "@/shared/components/AppHeader.tsx";
import { WorkspaceConnectionRecovery } from "@/tools/video-editor/components/WorkspaceConnectionRecovery.tsx";
import {
  LOCAL_BRIDGE_BASE_URL,
  useAstridBridgeDiscovery,
} from "@/tools/video-editor/hooks/useAstridBridgeDiscovery.ts";
import { RuntimeDataProvider } from "@/integrations/runtime/dataProvider.ts";
import type { SaveStatus } from "@/tools/video-editor/hooks/useTimelinePersistence.ts";
import {
  astridTimelineReadPath,
  isAstridWorkspaceV1,
} from "@/integrations/astrid/workspaceV1.ts";
import { publishLocalTestExtensionDiagnostics } from "@/app/localTestRuntime.ts";
import {
  createHostOwnedExtensionOperationalEmitter,
  dispatchExtensionOperationalEvent,
  getExtensionReleaseFlags,
  selectReleaseEnabledExtensions,
} from "@/tools/video-editor/runtime/extensionReleaseControls.ts";

type VideoEditorMode = "local" | "runtime";

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

/** Keep the manual ACP lifecycle inspector out of normal editor chrome. */
const ACP_DEBUG_PARAM = "acpDebug";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return () => undefined;
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  if (query.addEventListener) {
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }
  query.addListener(onChange);
  return () => query.removeListener(onChange);
}

function getReducedMotionSnapshot(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/** Browser-local resume state for the URL-owned Astrid workspace selector. */
export const LOCAL_ASTRID_LAST_OPENED_PROJECT_STORAGE_KEY =
  "astrid:lastOpenedLocalProjectSlug";

type LocalAstridProject = {
  slug: string;
  name: string;
  created_at?: string;
  project_id?: string;
  metadata?: Record<string, unknown>;
};

function mostRecentlyCreatedLocalProject(
  projects: LocalAstridProject[],
): LocalAstridProject | null {
  return (
    projects
      .map((project) => ({
        project,
        createdAt: project.created_at
          ? Date.parse(project.created_at)
          : Number.NaN,
      }))
      .filter(({ createdAt }) => Number.isFinite(createdAt))
      .sort(
        (left, right) =>
          right.createdAt - left.createdAt ||
          left.project.slug.localeCompare(right.project.slug),
      )[0]?.project ?? null
  );
}

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
    throw new Error(
      `Astrid bridge request failed: ${response.status} ${response.statusText}`,
    );
  }
  return parseBridgePayload(schema, await response.json(), what);
}

/**
 * The local timeline *name* for the header/dropdown label comes from the
 * timeline list when workspace.v1 is active. The latest Runtime deliberately
 * retires the mutable timeline GET, so the legacy name read remains limited
 * to the legacy bridge path.
 */
function useBridgeTimelineName(
  projectSlug: string | null,
  timelineRef: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["astrid-bridge", projectSlug, timelineRef, "name"],
    enabled: enabled && Boolean(projectSlug) && Boolean(timelineRef),
    queryFn: async () => {
      const payload = await fetchBridgeJson(
        astridTimelineReadPath(projectSlug!, timelineRef!),
        bridgeTimelinePayloadSchema,
        "timeline read",
      );
      return typeof payload.name === "string" ? payload.name : null;
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
  const runtimeUnavailable = error instanceof RuntimeUnavailableError;
  const title = authenticationFailed
    ? "Workspace Runtime authentication failed"
    : runtimeUnavailable && error.failureKind === "admission"
      ? "Workspace Runtime failed its startup checks"
      : runtimeUnavailable && error.failureKind === "storage"
        ? "Workspace Runtime reported a storage failure"
        : "Workspace Runtime is unavailable";

  return (
    <div
      className="flex items-center justify-between gap-4 border-b border-destructive/30 bg-destructive/5 px-4 py-3"
      data-testid="runtime-connector-alert"
      role="alert"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {error.recoveryAction}
        </p>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void onRetry()}
        disabled={retrying}
      >
        {retrying ? "Retrying Runtime connection…" : "Retry Runtime connection"}
      </Button>
    </div>
  );
}

function useResolvedRuntimeProjectId(selector: string | null): {
  projectId: string | null;
  notFound: Error | null;
  error: Error | null;
  pending: boolean;
} {
  const [state, setState] = useState<{
    selector: string;
    projectId: string | null;
    error: Error | null;
    notFound: boolean;
  } | null>(null);
  useEffect(() => {
    if (!selector) return;
    let cancelled = false;
    resolveRuntimeProjectId(selector).then(
      (projectId) => {
        if (!cancelled)
          setState({ selector, projectId, error: null, notFound: false });
      },
      (error: unknown) => {
        if (cancelled) return;
        const err = error instanceof Error ? error : new Error(String(error));
        setState({
          selector,
          projectId: null,
          error: err,
          notFound: /not found$/.test(err.message),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [selector]);
  // A result for a previous selector must never be used for the current one.
  const current = selector && state?.selector === selector ? state : null;
  // Only a positive "not found" vetoes the selector. If resolution fails for
  // another reason (Runtime down), the editor mounts from the URL value and
  // its own Runtime provider reports the failure. While the single getProject
  // call is in flight nothing is mounted, and the copy says "Connecting".
  return {
    projectId: !current || current.notFound ? null : (current.projectId ?? selector),
    notFound: current?.notFound ? current.error : null,
    error: current?.error ?? null,
    pending: !!selector && !current,
  };
}

function useVideoEditorProviderSelection({
  mode,
  localProjectSlug,
  localProjectId,
  localTimelineId,
  localTimelineName,
  runtimeProjectId,
  runtimeProjectSlug,
  runtimeTimelineId,
  runtimeTimelineName,
  onBridgeRequest,
  onRuntimeError,
}: {
  mode: VideoEditorMode;
  localProjectSlug: string | null;
  localProjectId: string | null;
  localTimelineId: string | null;
  localTimelineName: string | null;
  runtimeProjectId: string | null;
  runtimeProjectSlug?: string | null;
  runtimeTimelineId: string | null;
  runtimeTimelineName?: string | null;
  onBridgeRequest?: (event: AstridBridgeRequestObservation) => void;
  onRuntimeError?: (error: RuntimeConnectorError) => void;
}): ProviderSelection | null {
  const providerKind =
    mode === "runtime"
      ? "runtime"
      : isAstridWorkspaceV1
        ? "local-runtime"
        : "bridge";
  const providerProjectId =
    mode === "runtime"
      ? runtimeProjectId
      : isAstridWorkspaceV1
        ? localProjectId
        : null;
  const providerTimelineId =
    mode === "runtime" ? runtimeTimelineId : localTimelineId;
  const runtimeErrorHandler =
    providerKind === "bridge" ? undefined : onRuntimeError;
  const bridgeRequestObserver =
    providerKind === "bridge" ? onBridgeRequest : undefined;

  // Display metadata can refresh while the editor and its pending reads stay
  // mounted. Keep their stateful provider owned by the effective authority.
  const providerConnection = useMemo<Pick<
    ProviderSelection,
    "dataProvider" | "runtimeReconnect"
  > | null>(() => {
    if (!providerProjectId || !providerTimelineId) {
      return null;
    }
    if (providerKind === "bridge") {
      return {
        dataProvider: new AstridBridgeDataProvider({
          projectSlug: providerProjectId,
          timelineRef: providerTimelineId,
          timelineId: providerTimelineId,
          onBridgeRequest: bridgeRequestObserver,
        }),
      };
    }
    const dataProvider = new RuntimeDataProvider({
      projectId: providerProjectId,
      onRuntimeError: runtimeErrorHandler,
    });
    return { dataProvider, runtimeReconnect: () => dataProvider.reconnect() };
  }, [
    providerKind,
    providerProjectId,
    providerTimelineId,
    runtimeErrorHandler,
    bridgeRequestObserver,
  ]);

  return useMemo(() => {
    if (!providerConnection) {
      return null;
    }
    if (mode === "runtime") {
      if (!runtimeProjectId || !runtimeTimelineId) {
        return null;
      }
      return {
        ...providerConnection,
        projectId: runtimeProjectId,
        projectSlug: runtimeProjectSlug ?? runtimeProjectId,
        timelineId: runtimeTimelineId,
        timelineName: runtimeTimelineName ?? null,
        // Runtime authentication is owned by the connector/proxy. Keep the
        // app user null so cloud-only catalogs cannot become a second authority.
        userId: null,
        remountKey: `runtime:${runtimeProjectId}:${runtimeTimelineId}`,
      };
    }

    if (mode === "local") {
      if (!localProjectSlug || !localTimelineId) {
        return null;
      }
      if (isAstridWorkspaceV1) {
        // Workspace v1 writes use the canonical id; the slug/name are display
        // metadata and can change without replacing the authority's provider.
        if (!localProjectId) {
          return null;
        }
        return {
          ...providerConnection,
          projectId: localProjectId,
          projectSlug: localProjectSlug,
          timelineId: localTimelineId,
          timelineName: localTimelineName,
          userId: null,
          remountKey: `local-runtime:${localProjectId}:${localTimelineId}`,
        };
      }
      return {
        ...providerConnection,
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
    providerConnection,
    localProjectSlug,
    localProjectId,
    localTimelineId,
    localTimelineName,
    mode,
    runtimeProjectId,
    runtimeTimelineId,
    runtimeProjectSlug,
    runtimeTimelineName,
  ]);
}

export default function VideoEditorPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotionSnapshot,
    () => true,
  );

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

  const extensionReleaseFlags = getExtensionReleaseFlags({
    development: import.meta.env.DEV,
  });
  const bridgeOperationalEmitter = useMemo(
    () =>
      createHostOwnedExtensionOperationalEmitter(
        {
          releaseRevision: extensionReleaseFlags.configurationRevision,
          extensionVersions: new Map(),
        },
        dispatchExtensionOperationalEvent,
      ),
    [extensionReleaseFlags.configurationRevision],
  );
  const onBridgeRequest = useCallback(
    (observation: AstridBridgeRequestObservation) => {
      if (!extensionReleaseFlags.extensionHostEnabled) return;
      bridgeOperationalEmitter.emit({
        event: "bridge.request",
        outcome: observation.outcome,
        durationMs: observation.durationMs,
        ...(observation.errorClass
          ? { errorClass: observation.errorClass }
          : {}),
      });
    },
    [bridgeOperationalEmitter, extensionReleaseFlags.extensionHostEnabled],
  );

  const smokeDirectExtensions = useMemo(() => {
    // The routed native editor uses the same admitted catalog for every backend.
    const disabled = import.meta.env.DEV ? devDisabledIds : new Set<string>();
    // Arbitrary scratchpad manifests remain usable in DEV. Production alone
    // applies the frozen reviewed inventory in addition to the runtime flags.
    const releaseEnabledExtensions = (
      import.meta.env.DEV
        ? devLocalExtensions
        : selectReleaseEnabledExtensions(
            devLocalExtensions,
            extensionReleaseFlags,
          )
    ).filter((extension) => !disabled.has(extension.manifest.id as string));
    const direct = [...releaseEnabledExtensions];
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
  const timelineOverlaysEnabled =
    extensionReleaseFlags.extensionHostEnabled &&
    (smokeDirectExtensions ?? []).some((ext) =>
      ext.manifest.contributions?.some(
        (contribution) => contribution.kind === "timelineOverlay",
      ),
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
    publishLocalTestExtensionDiagnostics("loader", loaderDiagnostics);
  }, [loaderDiagnostics]);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { navigateHome, targetPath } = useHomeNavigation();
  const globalHeaderSlot = useOptionalGlobalHeaderSlot();
  const hasGlobalHeader = globalHeaderSlot.hasProvider;

  // Runtime mode is an explicit authenticated connector entry. It remains
  // separate from the normal Astrid bridge route because it uses a different
  // transport, not a different project authority.
  // `runtimeProject` may be a slug or a canonical id; it is resolved to the
  // canonical id (B8) before the provider is built.
  const runtimeProjectSelector = searchParams.get("runtimeProject");
  const runtimeTimelineId = searchParams.get("runtimeTimeline");
  const runtimeMode = searchParams.get("runtime") === "1";
  const {
    projectId: runtimeProjectId,
    notFound: runtimeProjectNotFound,
    pending: runtimeProjectResolving,
  } = useResolvedRuntimeProjectId(runtimeMode ? runtimeProjectSelector : null);
  const acpDebugEnabled =
    runtimeMode && searchParams.get(ACP_DEBUG_PARAM) === "1";
  const localProjectSlug = searchParams.get("localProject");
  const localTimelineId = searchParams.get("localTimeline");
  const mode: VideoEditorMode = runtimeMode ? "runtime" : "local";
  const isHomeTool = isHomeToolPathActive(pathname, targetPath);

  // Selector dropdown open state drives discovery refetch-on-open + polling.
  const [selectorsOpen, setSelectorsOpen] = useState(false);
  const discovery = useAstridBridgeDiscovery({
    open: selectorsOpen && mode === "local" && isAstridWorkspaceV1,
    currentLocal: mode === "local" && isAstridWorkspaceV1,
    selectedProjectSlug: localProjectSlug,
    onBridgeRequest,
  });

  const runtimeDiscovery = useRuntimeEditorDiscovery({
    enabled: runtimeMode,
    projectId: runtimeProjectId,
    open: selectorsOpen,
  });
  const selectedRuntimeProject = runtimeDiscovery.project;
  const selectedRuntimeTimeline =
    runtimeDiscovery.timelinesQuery.data?.find(
      (t) => t.timeline_id === runtimeTimelineId,
    ) ?? null;
  useEffect(() => {
    if (
      !runtimeMode ||
      !selectedRuntimeProject ||
      runtimeTimelineId ||
      runtimeDiscovery.timelinesQuery.isLoading ||
      runtimeDiscovery.timelinesQuery.error
    )
      return;
    const nextTimeline = chooseRuntimeTimeline(
      selectedRuntimeProject,
      runtimeDiscovery.timelinesQuery.data ?? [],
    );
    if (!nextTimeline) return;
    setSearchParams(
      (current) => {
        if (
          current.get("runtimeProject") !== runtimeProjectSelector ||
          current.has("runtimeTimeline")
        )
          return current;
        const next = new URLSearchParams(current);
        next.set("runtimeTimeline", nextTimeline.timeline_id);
        return next;
      },
      { replace: true },
    );
  }, [
    runtimeMode,
    selectedRuntimeProject,
    runtimeProjectSelector,
    runtimeTimelineId,
    runtimeDiscovery.timelinesQuery.data,
    runtimeDiscovery.timelinesQuery.isLoading,
    runtimeDiscovery.timelinesQuery.error,
    setSearchParams,
  ]);

  const localProjects = discovery.projectsQuery.data?.projects ?? null;
  const selectedLocalProject =
    localProjects?.find((project) => project.slug === localProjectSlug) ?? null;
  const localProjectId = selectedLocalProject?.project_id ?? null;
  const localProjectListPending =
    discovery.healthQuery.isLoading ||
    discovery.projectsQuery.isLoading ||
    discovery.projectsQuery.isFetching ||
    !discovery.projectsQuery.data;

  // The editor route is URL-owned, so resume its local Runtime project only
  // after the authoritative project list has loaded. An explicit URL always
  // wins, including an explicit stale slug that should be reported as missing.
  useEffect(() => {
    if (
      mode !== "local" ||
      localProjectSlug ||
      discovery.bridgeDown ||
      discovery.projectsQuery.error ||
      localProjectListPending ||
      !localProjects
    ) {
      return;
    }

    let lastOpenedSlug: string | null = null;
    try {
      lastOpenedSlug = window.localStorage.getItem(
        LOCAL_ASTRID_LAST_OPENED_PROJECT_STORAGE_KEY,
      );
    } catch {
      // Storage can be disabled; deterministic newest-project fallback still works.
    }
    const projectToRestore =
      localProjects.find((project) => project.slug === lastOpenedSlug) ??
      mostRecentlyCreatedLocalProject(localProjects);
    if (!projectToRestore) return;

    setSearchParams(
      (current) => {
        // Protect a project URL written by a user action in the same render turn.
        if (current.has("localProject")) return current;
        const next = new URLSearchParams(current);
        next.set("localProject", projectToRestore.slug);
        return next;
      },
      { replace: true },
    );
  }, [
    discovery.bridgeDown,
    discovery.projectsQuery.error,
    localProjectListPending,
    localProjects,
    localProjectSlug,
    mode,
    setSearchParams,
  ]);

  // Directly opening a valid local URL also updates local resume state. A stale
  // explicit URL never replaces the last valid selection.
  useEffect(() => {
    if (mode !== "local" || !localProjectSlug || !selectedLocalProject) return;
    try {
      window.localStorage.setItem(
        LOCAL_ASTRID_LAST_OPENED_PROJECT_STORAGE_KEY,
        localProjectSlug,
      );
    } catch {
      // The project remains selected in the URL if browser storage is unavailable.
    }
  }, [localProjectSlug, mode, selectedLocalProject]);

  // Project chat is available even when the selected project has no timeline.
  // The mounted editor adds its live timeline/Elements context as a higher layer.
  const agentChatRegistry = useOptionalAgentChatRegistry();
  const chatProjectId =
    mode === "runtime"
      ? (selectedRuntimeProject?.project_id ?? null)
      : isAstridWorkspaceV1
        ? localProjectId
        : localProjectSlug;
  const chatProjectSlug =
    mode === "runtime"
      ? (selectedRuntimeProject?.slug ?? null)
      : localProjectSlug;
  useEffect(() => {
    if (!agentChatRegistry) return;
    agentChatRegistry.registerProject({
      timelineId: null,
      editorContext: chatProjectId
        ? {
            tool: "video-editor",
            projectId: chatProjectId,
            projectSlug: chatProjectSlug,
            timelineId: null,
            timelineName: null,
            deepLink:
              typeof globalThis.location?.href === "string"
                ? globalThis.location.href
                : null,
          }
        : null,
    });
    return agentChatRegistry.unregisterProject;
  }, [agentChatRegistry, chatProjectId, chatProjectSlug]);

  const selectedLocalTimeline =
    discovery.timelinesQuery.data?.timelines?.find(
      (timeline) =>
        timeline.timeline_id === localTimelineId ||
        timeline.timeline_ulid === localTimelineId,
    ) ?? null;
  const [mountedSaveStatus, setMountedSaveStatus] =
    useState<SaveStatus>("saved");
  const [settingPrimaryTimelineId, setSettingPrimaryTimelineId] = useState<
    string | null
  >(null);
  const [runtimeConnectorError, setRuntimeConnectorError] =
    useState<RuntimeConnectorError | null>(null);
  const [runtimeRetrying, setRuntimeRetrying] = useState(false);
  const [nativeRecoveryError, setNativeRecoveryError] = useState<string | null>(
    null,
  );
  const [creatingFirstTimeline, setCreatingFirstTimeline] = useState(false);
  const [firstTimelineError, setFirstTimelineError] = useState<string | null>(
    null,
  );
  const timelineSelectionRef = useRef({
    projectId: localProjectId,
    timelineId: localTimelineId,
  });
  timelineSelectionRef.current = {
    projectId: localProjectId,
    timelineId: localTimelineId,
  };
  const attemptedFirstTimelineProjects = useRef(new Set<string>());
  const pendingAdditionalTimeline = useRef<{
    projectId: string;
    timelineId: string;
    name: string;
  } | null>(null);
  const bridgeTimelineName = useBridgeTimelineName(
    localProjectSlug,
    localTimelineId,
    mode === "local" && !isAstridWorkspaceV1,
  );
  const discoveredLocalTimelineName = selectedLocalTimeline?.name ?? null;
  const localTimelineName = isAstridWorkspaceV1
    ? discoveredLocalTimelineName
    : (bridgeTimelineName.data ?? null);
  const resolvedLocalProjectSlug = selectedLocalProject
    ? localProjectSlug
    : null;
  const runtimeProjectsPending =
    runtimeProjectResolving ||
    (!runtimeDiscovery.projectsQuery.data && !runtimeDiscovery.projectsQuery.error);
  const runtimeTimelinesPending =
    !!selectedRuntimeProject &&
    !runtimeDiscovery.timelinesQuery.data &&
    !runtimeDiscovery.timelinesQuery.error;
  const runtimeWorkspaceSettling =
    !runtimeProjectNotFound &&
    !runtimeDiscovery.projectsQuery.error &&
    !runtimeDiscovery.timelinesQuery.error &&
    (runtimeProjectsPending || runtimeTimelinesPending);
  // The URL owns the Runtime selection. Discovery can only veto it once it has
  // resolved and positively lacks the id; while pending or failed, the editor
  // mounts from the URL like main, and its own Runtime provider reports errors.
  const runtimeProjectMissing =
    !!runtimeProjectId &&
    !!runtimeDiscovery.projectsQuery.data &&
    !selectedRuntimeProject;
  const runtimeTimelineMissing =
    !!runtimeTimelineId &&
    !!runtimeDiscovery.timelinesQuery.data &&
    !selectedRuntimeTimeline;
  const runtimeSelectionVetoed = runtimeProjectMissing || runtimeTimelineMissing;
  const effectiveProviderKind =
    mode === "runtime"
      ? "runtime"
      : isAstridWorkspaceV1
        ? "local-runtime"
        : "bridge";
  const effectiveProviderProjectId =
    mode === "runtime"
      ? runtimeSelectionVetoed ? null : runtimeProjectId
      : isAstridWorkspaceV1
        ? localProjectId
        : resolvedLocalProjectSlug;
  const effectiveProviderTimelineId =
    mode === "runtime"
      ? runtimeSelectionVetoed ? null : runtimeTimelineId
      : selectedLocalTimeline?.timeline_id ?? null;
  const connectorScope = JSON.stringify([
    effectiveProviderKind,
    effectiveProviderProjectId,
    effectiveProviderTimelineId,
  ]);
  const currentConnectorScope = useRef(connectorScope);
  currentConnectorScope.current = connectorScope;
  const reportNativeFailure = useRef<() => void>(() => undefined);
  const onRuntimeError = useCallback((error: RuntimeConnectorError) => {
    if (currentConnectorScope.current !== connectorScope) return;
    setRuntimeConnectorError(error);
    setRuntimeRetrying(false);
    reportNativeFailure.current();
  }, [connectorScope]);
  const providerSelection = useVideoEditorProviderSelection({
    mode,
    localProjectSlug: resolvedLocalProjectSlug,
    localProjectId,
    localTimelineId: selectedLocalTimeline?.timeline_id ?? null,
    localTimelineName,
    runtimeProjectId: runtimeSelectionVetoed ? null : runtimeProjectId,
    runtimeTimelineId: runtimeSelectionVetoed ? null : runtimeTimelineId,
    runtimeProjectSlug: selectedRuntimeProject?.slug ?? runtimeProjectSelector,
    runtimeTimelineName:
      selectedRuntimeTimeline?.name ||
      selectedRuntimeTimeline?.slug ||
      (selectedRuntimeTimeline?.timeline_id &&
      !/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(selectedRuntimeTimeline.timeline_id)
        ? selectedRuntimeTimeline.timeline_id
        : null) ||
      "Untitled timeline",
    onBridgeRequest,
    onRuntimeError:
      mode === "runtime" || (mode === "local" && isAstridWorkspaceV1)
        ? onRuntimeError
        : undefined,
  });

  // dataKind V1 golden path (groken round 4): DEV-only fixture provider so the
  // transcript-lane example paints on any project with a media clip. Opt-in
  // via `?transcriptLaneFixture=1`; production builds drop the branch.
  const pageDataProvider = useMemo(() => {
    if (!providerSelection) return null;
    if (!import.meta.env.DEV) return providerSelection.dataProvider;
    const fixtureMode =
      import.meta.env.MODE === "test"
        ? new URLSearchParams(window.location.search).get(
            TRANSCRIPT_LANE_FIXTURE_PARAM,
          )
        : null;
    return fixtureMode !== null
      ? withTranscriptFixture(providerSelection.dataProvider, {
          dense: fixtureMode === "dense",
          renderMatrix: fixtureMode === "render-matrix",
        })
      : providerSelection.dataProvider;
  }, [providerSelection]);

  const nativeRecovery = useNativeEditorRecovery({
    enabled: isAstridWorkspaceV1 && !!providerSelection,
    scope: connectorScope,
    onRecovered: () => {
      setRuntimeConnectorError(null);
      setNativeRecoveryError(null);
      setRuntimeRetrying(false);
    },
  });
  reportNativeFailure.current = nativeRecovery.reportFailure;

  useEffect(() => {
    setRuntimeConnectorError(null);
    setNativeRecoveryError(null);
    setRuntimeRetrying(false);
  }, [mode, providerSelection?.remountKey]);

  const handleRuntimeRetry = useCallback(async () => {
    if (runtimeRetrying || nativeRecovery.retrying) {
      return;
    }
    const attempt = nativeRecovery.beginManualAttempt();
    setRuntimeRetrying(true);
    try {
      await assertNativeEditorConnection();
      if (providerSelection?.runtimeReconnect)
        await providerSelection.runtimeReconnect();
      await runtimeDiscovery.reconnect();
      nativeRecovery.completeRecovery(attempt);
    } catch {
      // RuntimeDataProvider reports the typed failure through onRuntimeError.
    } finally {
      setRuntimeRetrying(false);
    }
  }, [providerSelection, runtimeRetrying, runtimeDiscovery, nativeRecovery]);

  useEffect(() => {
    setMountedSaveStatus("saved");
  }, [providerSelection?.remountKey]);

  const [extensionPendingWork, setExtensionPendingWork] = useState<{
    scope: string;
    state: ExtensionPendingWorkState;
  } | null>(null);
  const scope = providerSelection?.remountKey ?? "";
  const onPendingWorkChange = useCallback(
    (state: ExtensionPendingWorkState) =>
      setExtensionPendingWork((previous) =>
        previous?.scope === scope &&
        JSON.stringify(previous.state) === JSON.stringify(state)
          ? previous
          : { scope, state },
      ),
    [scope],
  );
  const extensionWork =
    extensionPendingWork?.scope === scope ? extensionPendingWork.state : null;
  const extensionWriting = extensionWork?.writing ?? false;
  const extensionUnsaved = extensionWork?.unsaved ?? false;
  const isSwitchBlockedBySave =
    mountedSaveStatus === "saving" ||
    mountedSaveStatus === "retrying" ||
    extensionWriting;
  const confirmEditorRemount = useCallback(() => {
    if (!providerSelection) {
      return true;
    }
    // A save round-trip is in flight or a transport retry is scheduled —
    // switching would abandon it and lose the edit. Block like `saving`.
    if (
      mountedSaveStatus === "saving" ||
      mountedSaveStatus === "retrying" ||
      extensionWriting
    ) {
      return false;
    }
    if (
      extensionUnsaved &&
      !window.confirm(
        "You have an unsaved project transcript draft or conflict. Your draft will remain available for this source. Switch editors?",
      )
    )
      return false;
    if (mountedSaveStatus === "dirty") {
      return window.confirm(
        "You have unsaved timeline changes. Switch editors and discard them?",
      );
    }
    if (mountedSaveStatus === "error") {
      return window.confirm(
        "The last timeline save failed. Switch editors anyway?",
      );
    }
    return true;
  }, [mountedSaveStatus, providerSelection, extensionWriting, extensionUnsaved]);

  const handleSelectRuntimeProject = useCallback(
    (id: string) => {
      if (
        id === runtimeProjectId ||
        !runtimeDiscovery.projectsQuery.data?.some(
          (p) => p.project_id === id,
        ) ||
        !confirmEditorRemount()
      )
        return;
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("runtime", "1");
          next.set("runtimeProject", id);
          next.delete("runtimeTimeline");
          next.delete("localProject");
          next.delete("localTimeline");
          return next;
        },
        { replace: true },
      );
    },
    [
      runtimeProjectId,
      runtimeDiscovery.projectsQuery.data,
      confirmEditorRemount,
      setSearchParams,
    ],
  );
  const handleSelectRuntimeTimeline = useCallback(
    (id: string) => {
      if (
        id === runtimeTimelineId ||
        !runtimeDiscovery.timelinesQuery.data?.some(
          (t) => t.timeline_id === id,
        ) ||
        !confirmEditorRemount()
      )
        return;
      setSearchParams(
        (current) => {
          if (current.get("runtimeProject") !== runtimeProjectSelector)
            return current;
          const next = new URLSearchParams(current);
          next.set("runtimeTimeline", id);
          return next;
        },
        { replace: true },
      );
    },
    [
      runtimeTimelineId,
      runtimeProjectSelector,
      runtimeDiscovery.timelinesQuery.data,
      confirmEditorRemount,
      setSearchParams,
    ],
  );

  const handleSelectProject = useCallback(
    (slug: string) => {
      if (!slug || slug === localProjectSlug) {
        return;
      }
      if (!confirmEditorRemount()) {
        return;
      }
      try {
        window.localStorage.setItem(
          LOCAL_ASTRID_LAST_OPENED_PROJECT_STORAGE_KEY,
          slug,
        );
      } catch {
        // The selection still proceeds through the URL when browser storage is unavailable.
      }
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("localProject", slug);
          next.delete("localTimeline");
          return next;
        },
        { replace: true },
      );
    },
    [confirmEditorRemount, localProjectSlug, setSearchParams],
  );

  const handleSelectTimeline = useCallback(
    (timelineId: string) => {
      if (!timelineId || timelineId === localTimelineId) {
        return;
      }
      if (!confirmEditorRemount()) {
        return;
      }
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set("localTimeline", timelineId);
          return next;
        },
        { replace: true },
      );
    },
    [confirmEditorRemount, localTimelineId, setSearchParams],
  );

  const handleCreateFirstTimeline = useCallback(async () => {
    if (
      !isAstridWorkspaceV1 ||
      !localProjectSlug ||
      !localProjectId ||
      creatingFirstTimeline
    ) {
      return;
    }
    setCreatingFirstTimeline(true);
    setFirstTimelineError(null);
    try {
      const timelineRef = await ensureProjectHasTimeline(
        localProjectId,
        new AstridRuntimeClient(),
      );
      await Promise.all([
        discovery.projectsQuery.refetch(),
        discovery.timelinesQuery.refetch(),
      ]);
      if (
        timelineSelectionRef.current.projectId === localProjectId &&
        !timelineSelectionRef.current.timelineId
      ) {
        handleSelectTimeline(timelineRef);
      }
      toast.success("Timeline ready");
    } catch (error) {
      const safeDetail =
        error instanceof ApiError
          ? `${error.status} ${error.code}: ${error.message.replace(/[\r\n]+/g, " ").slice(0, 120)}`
          : error instanceof RuntimeUnavailableError
            ? `${error.status ?? "unavailable"} ${error.causeCode ?? error.code}`
            : error instanceof Error
              ? error.name
              : "unknown error";
      setFirstTimelineError(safeDetail);
      toast.error("Could not create the first timeline. You can retry here.");
    } finally {
      setCreatingFirstTimeline(false);
    }
  }, [
    creatingFirstTimeline,
    discovery.projectsQuery,
    discovery.timelinesQuery,
    handleSelectTimeline,
    localProjectId,
    localProjectSlug,
  ]);

  // Only authoritative empty project results trigger setup. Bound attempts per
  // mounted project prevent failed creation from becoming a background loop.
  useEffect(() => {
    if (
      !isAstridWorkspaceV1 ||
      mode !== "local" ||
      !localProjectId ||
      localTimelineId ||
      discovery.timelinesQuery.isLoading ||
      discovery.timelinesQuery.isFetching ||
      discovery.timelinesQuery.error ||
      discovery.timelinesQuery.data?.timelines?.length !== 0 ||
      creatingFirstTimeline ||
      attemptedFirstTimelineProjects.current.has(localProjectId)
    )
      return;
    attemptedFirstTimelineProjects.current.add(localProjectId);
    void handleCreateFirstTimeline();
  }, [
    mode,
    localProjectId,
    localTimelineId,
    discovery.timelinesQuery.data,
    discovery.timelinesQuery.isLoading,
    discovery.timelinesQuery.isFetching,
    discovery.timelinesQuery.error,
    creatingFirstTimeline,
    handleCreateFirstTimeline,
  ]);

  const handleCreateAdditionalTimeline = useCallback(async () => {
    if (
      !isAstridWorkspaceV1 ||
      !localProjectSlug ||
      !localProjectId ||
      creatingFirstTimeline
    ) {
      return;
    }
    setCreatingFirstTimeline(true);
    setFirstTimelineError(null);
    const knownTimelines = discovery.timelinesQuery.data?.timelines ?? [];
    const timelineCount = knownTimelines.filter(
      (timeline) => !timeline.is_shot,
    ).length;
    const pending =
      pendingAdditionalTimeline.current?.projectId === localProjectId
        ? pendingAdditionalTimeline.current
        : {
            projectId: localProjectId,
            timelineId: generateUUID(),
            name: `Timeline ${timelineCount + 1}`,
          };
    pendingAdditionalTimeline.current = pending;
    try {
      const timelineRef = await createCanonicalTimeline(
        localProjectId,
        {
          name: pending.name,
          timelineId: pending.timelineId,
          idempotencyKey: `astrid-timeline-create-${localProjectId}-${pending.timelineId}`,
        },
        new AstridRuntimeClient(),
      );
      await discovery.timelinesQuery.refetch();
      pendingAdditionalTimeline.current = null;
      handleSelectTimeline(timelineRef);
      toast.success("Timeline ready");
    } catch (error) {
      const safeDetail =
        error instanceof ApiError
          ? `${error.status} ${error.code}: ${error.message.replace(/[\r\n]+/g, " ").slice(0, 120)}`
          : error instanceof RuntimeUnavailableError
            ? `${error.status ?? "unavailable"} ${error.causeCode ?? error.code}`
            : error instanceof Error
              ? error.name
              : "unknown error";
      setFirstTimelineError(safeDetail);
      toast.error(`Could not create timeline (${safeDetail}). Retry here.`);
    } finally {
      setCreatingFirstTimeline(false);
    }
  }, [
    creatingFirstTimeline,
    discovery.timelinesQuery,
    handleSelectTimeline,
    localProjectId,
    localProjectSlug,
  ]);

  const handleSetPrimaryTimeline = useCallback(
    async (timelineId: string) => {
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
        handleSelectTimeline(timelineId);
        toast.success("Primary timeline updated");
      } catch (error) {
        console.error("[video-editor] Failed to set primary timeline", error);
        toast.error("Failed to set the primary timeline");
      } finally {
        setSettingPrimaryTimelineId(null);
      }
    },
    [
      discovery.projectsQuery,
      discovery.timelinesQuery,
      providerSelection,
      handleSelectTimeline,
    ],
  );

  // Local timeline auto-pick: when a local project is selected without a
  // timeline (or the current one no longer exists under that project), retain
  // the current id if it is still valid. Runtime v1 has projects whose stored
  // default still points at an old reference document, so prefer the explicit
  // default only when present, then the canonical `main`, then a named
  // `rough-cut`, before falling back to the first timeline.
  useEffect(() => {
    if (mode !== "local" || !localProjectSlug) {
      return;
    }
    const localTimelines = discovery.timelinesQuery.data?.timelines;
    if (
      discovery.timelinesQuery.isLoading ||
      discovery.timelinesQuery.error ||
      !localTimelines
    ) {
      return;
    }
    if (localTimelines.length === 0) {
      return;
    }
    // The URL may carry either the canonical id or its ULID alias (the
    // dropdown selects `timeline_ulid ?? timeline_id`), so validate against both.
    if (localTimelineId) return;
    // Runtime v1 currently does not populate `is_default` for every existing
    // Astrid document. Prefer the explicit default, then the canonical `main`
    // slug, then a project-level rough cut, before falling back to the first
    // available document. This keeps reference/source timelines from winning
    // merely because they were created first.
    const nextTimeline =
      localTimelines.find((timeline) => timeline.is_default) ??
      localTimelines.find((timeline) => timeline.slug === "main") ??
      localTimelines.find((timeline) => timeline.slug === "rough-cut") ??
      localTimelines[0];
    if (!nextTimeline) {
      return;
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("localProject", localProjectSlug);
        // Prefer the ULID: it is the routable address for bridge requests,
        // while the canonical timeline_id is identity only.
        next.set(
          "localTimeline",
          nextTimeline.timeline_ulid ?? nextTimeline.timeline_id,
        );
        return next;
      },
      { replace: true },
    );
  }, [
    discovery.timelinesQuery.data,
    discovery.timelinesQuery.error,
    discovery.timelinesQuery.isLoading,
    localProjectSlug,
    localTimelineId,
    mode,
    setSearchParams,
  ]);

  // Until the auto-pick above writes ?localTimeline=, a loaded list that has
  // timelines is still resolving: show loading, not "No timeline yet". The
  // list has no archived flag (only projects do), so every listed timeline is
  // treated as active, matching the auto-pick candidates.
  const localTimelinesPending =
    discovery.timelinesQuery.isPending ||
    (!localTimelineId &&
      (discovery.timelinesQuery.data?.timelines.length ?? 0) > 0);

  const selectors = useMemo(
    () => (
      <ProjectTimelineSelectors
        localProjectSlug={localProjectSlug}
        localTimelineId={localTimelineId}
        localTimelineName={localTimelineName}
        discovery={discovery}
        onSelectProject={handleSelectProject}
        onSelectTimeline={handleSelectTimeline}
        onSetPrimaryTimeline={handleSetPrimaryTimeline}
        onCreateTimeline={
          isAstridWorkspaceV1 &&
          (discovery.timelinesQuery.data?.timelines?.length ?? 0) > 0
            ? handleCreateAdditionalTimeline
            : undefined
        }
        creatingTimeline={creatingFirstTimeline}
        settingPrimaryTimelineId={settingPrimaryTimelineId}
        disabled={isSwitchBlockedBySave}
        showProjectSelector={false}
        onOpenChange={setSelectorsOpen}
      />
    ),
    [
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
      handleCreateAdditionalTimeline,
      hasGlobalHeader,
      isSwitchBlockedBySave,
      creatingFirstTimeline,
      localProjectSlug,
      localTimelineId,
      localTimelineName,
      settingPrimaryTimelineId,
    ],
  );

  const runtimePickerProps = {
    projects: (runtimeDiscovery.projectsQuery.data ?? []).map((p) => ({
      id: p.project_id,
      name: p.name || "Untitled project",
      detail: p.slug,
    })),
    timelines: (runtimeDiscovery.timelinesQuery.data ?? [])
      .map((t, index) => {
        const name =
          t.name ||
          t.slug ||
          (!/^[0-9A-HJKMNP-TV-Z]{26}$/i.test(t.timeline_id)
            ? t.timeline_id
            : "Untitled timeline");
        const editAt = runtimeDiscovery.timelineEditQueries?.[index]?.data;
        const date = editAt ? new Date(editAt) : null;
        const validDate = date && Number.isFinite(date.getTime()) ? date : null;
        return {
          id: t.timeline_id,
          name,
          detail: validDate
            ? `edited ${formatDistanceToNowStrict(validDate, { addSuffix: true })}`
            : undefined,
          editTime: validDate?.getTime() ?? null,
        };
      })
      .filter((row, index) => {
        const timeline = runtimeDiscovery.timelinesQuery.data?.[index];
        return !!timeline && (!timeline.is_shot || timeline.timeline_id === runtimeTimelineId);
      })
      .sort((a, b) => {
        if (a.editTime === null && b.editTime !== null) return 1;
        if (a.editTime !== null && b.editTime === null) return -1;
        if (a.editTime !== null && b.editTime !== null && a.editTime !== b.editTime)
          return b.editTime - a.editTime;
        return a.name.localeCompare(b.name);
      })
      .map(({ editTime: _editTime, ...row }) => row),
    projectId: runtimeProjectId,
    timelineId: runtimeTimelineId,
    projectName: selectedRuntimeProject?.name,
    timelineName:
      selectedRuntimeTimeline?.name || selectedRuntimeTimeline?.slug,
    projectsLoading:
      runtimeProjectResolving || runtimeDiscovery.projectsQuery.isLoading,
    // The timeline list waits on the project list; a timeline named by the URL
    // is still loading until then, never "unavailable".
    timelinesLoading:
      runtimeProjectResolving ||
      (!!runtimeTimelineId && runtimeDiscovery.projectsQuery.isLoading) ||
      (!!selectedRuntimeProject && runtimeDiscovery.timelinesQuery.isLoading),
    projectsError: runtimeDiscovery.projectsQuery.error?.message,
    timelinesError: runtimeDiscovery.timelinesQuery.error?.message,
    onSelectProject: handleSelectRuntimeProject,
    onSelectTimeline: handleSelectRuntimeTimeline,
    onRenameTimeline: async (timelineId: string, name: string) => {
      if (!runtimeProjectId) throw new Error("No Runtime project is selected.");
      await new AstridRuntimeClient().renameTimeline(runtimeProjectId, timelineId, name);
      await runtimeDiscovery.timelinesQuery.refetch();
    },
    onRetry: () => void handleRuntimeRetry(),
    disabled: isSwitchBlockedBySave,
    onOpenChange: setSelectorsOpen,
  };
  const runtimeProjectControls = (
    <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
      <img
        src="/astrid-favicon.svg"
        alt="Astrid"
        className="h-[30px] w-[30px] shrink-0"
        data-testid="astrid-project-row-logo"
        data-boot-mink-target=""
      />
      <ProjectTimelinePicker
        {...runtimePickerProps}
        showProjectLabel={false}
        showTimelineSelector={false}
      />
      <ProjectHeaderActions
        selectedProject={selectedRuntimeProject}
        onProjectCreated={() => void runtimeDiscovery.projectsQuery.refetch()}
        onProjectUpdated={() => void runtimeDiscovery.projectsQuery.refetch()}
        disabled={runtimeDiscovery.projectsQuery.isLoading}
      />
    </div>
  );
  const runtimeTimelineControls = (
    <>
      <ProjectTimelinePicker
        {...runtimePickerProps}
        showProjectSelector={false}
      />
      {acpDebugEnabled && <AstridAcpSessionControls enabled />}
    </>
  );

  const localNavigationControls = useMemo(
    () => (
      <div className="flex min-w-0 flex-col gap-2 xl:flex-row xl:items-center">
        <div className="min-w-0 flex-1">{selectors}</div>
      </div>
    ),
    [selectors],
  );
  const localProjectControls = useMemo(
    () => (
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <img
          src="/astrid-favicon.svg"
          alt="Astrid"
          className="h-[30px] w-[30px] shrink-0"
          data-testid="astrid-project-row-logo"
          data-boot-mink-target=""
        />
        <ProjectTimelineSelectors
          localProjectSlug={localProjectSlug}
          localProjectName={selectedLocalProject?.name ?? null}
          localTimelineId={localTimelineId}
          localTimelineName={localTimelineName}
          discovery={discovery}
          onSelectProject={handleSelectProject}
          onSelectTimeline={handleSelectTimeline}
          disabled={isSwitchBlockedBySave}
          showProjectSelector
          showProjectLabel={false}
          showTimelineSelector={false}
          onOpenChange={setSelectorsOpen}
        />
        <ProjectHeaderActions
          selectedProject={selectedLocalProject}
          onProjectCreated={() => {
            void discovery.projectsQuery.refetch();
          }}
          onProjectUpdated={() => {
            void discovery.projectsQuery.refetch();
          }}
          disabled={discovery.projectsQuery.isLoading}
        />
      </div>
    ),
    [
      discovery,
      handleSelectProject,
      handleSelectTimeline,
      isSwitchBlockedBySave,
      localProjectSlug,
      localTimelineId,
      localTimelineName,
      selectedLocalProject,
    ],
  );
  const projectHeaderControls =
    mode === "runtime" ? runtimeProjectControls : localProjectControls;
  const timelinePreviewControls =
    mode === "runtime" ? runtimeTimelineControls : localNavigationControls;
  const headerControlsRef = useRef(projectHeaderControls);
  headerControlsRef.current = projectHeaderControls;
  const headerIdentity = JSON.stringify([
    mode,
    runtimeProjectId,
    runtimeTimelineId,
    runtimeDiscovery.projectsQuery.data,
    runtimeDiscovery.timelinesQuery.data,
    runtimeDiscovery.projectsQuery.isLoading,
    runtimeDiscovery.timelinesQuery.isLoading,
    runtimeDiscovery.projectsQuery.error?.message,
    runtimeDiscovery.timelinesQuery.error?.message,
    localProjectSlug,
    localTimelineId,
    localProjectNameForHeader(),
    discovery.projectsQuery.data,
    discovery.timelinesQuery.data,
    discovery.healthQuery.isLoading,
    discovery.bridgeDown,
    isSwitchBlockedBySave,
    extensionUnsaved,
    mountedSaveStatus,
  ]);
  function localProjectNameForHeader() {
    return selectedLocalProject?.name ?? null;
  }

  useEffect(() => {
    if (!hasGlobalHeader) {
      return;
    }
    globalHeaderSlot.setGlobalHeaderContent(headerControlsRef.current);
    return () => globalHeaderSlot.clearGlobalHeaderContent();
  }, [
    headerIdentity,
    globalHeaderSlot.clearGlobalHeaderContent,
    globalHeaderSlot.setGlobalHeaderContent,
    hasGlobalHeader,
  ]);

  // The same header is used for the loaded editor and every page-level
  // fallback, so switching between loading, empty, and editing states does
  // not change the navigation chrome.
  const selectorsHeader = !hasGlobalHeader ? (
    <AppHeader
      navigationMode={isHomeTool ? "tools" : "home"}
      onNavigate={undefined}
      navigationControls={projectHeaderControls}
      timelineName={null}
      showProjectControls={false}
    />
  ) : null;

  if (!isAstridWorkspaceV1) {
    return (
      <div className="flex h-full flex-col">
        <AppHeader showProjectControls={false} />
        <div className="m-auto max-w-lg p-6" role="alert">
          <h1 className="text-lg font-medium">Connect the local workspace</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This app has not connected to its local workspace. Open workspace
            settings to connect, then retry.
          </p>
          <Button
            className="mt-3"
            onClick={() => dispatchAppEvent("openSettings", {})}
          >
            Workspace settings
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "runtime") {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-transparent">
        {runtimeConnectorError && (
          <RuntimeConnectorRecoveryBanner
            error={runtimeConnectorError}
            onRetry={handleRuntimeRetry}
            retrying={runtimeRetrying || nativeRecovery.retrying}
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
              onPendingWorkChange={onPendingWorkChange}
              extensions={resolvedExtensions}
              timelineOverlaysEnabled={timelineOverlaysEnabled}
              extensionHostEnabled={extensionReleaseFlags.extensionHostEnabled}
              extensionReleaseRevision={
                extensionReleaseFlags.configurationRevision
              }
            >
              <AstridVideoEditorShell
                mode="full"
                timelineId={providerSelection.timelineId}
                onCreateTimeline={() => navigate("/")}
                headerNavigationControls={
                  hasGlobalHeader ? undefined : projectHeaderControls
                }
                previewNavigationControls={timelinePreviewControls}
                navigationMode={isHomeTool ? "tools" : "home"}
                showHeader={!hasGlobalHeader}
              />
            </VideoEditorProvider>
          </div>
        ) : (
          <>
            {!providerSelection && selectorsHeader}
            {/* While the workspace answers, the header alone holds the page: no
                status card or instructions, and nothing that moves when the
                editor takes over. Errors and real empty states still show. On a
                first load the boot layer stays up meanwhile (data-boot-hold, see
                main.tsx) and dissolves straight into the editor's frame. */}
            {runtimeWorkspaceSettling && <span data-boot-hold="" hidden />}
            {!runtimeWorkspaceSettling && (
              <>
                <div className="px-4 py-2">{timelinePreviewControls}</div>
                <div className="flex flex-1 items-center justify-center px-6">
                  <Card className="w-full max-w-md">
                    <CardHeader>
                      <CardTitle>
                        {runtimeProjectNotFound
                          ? "Project not found"
                          : runtimeProjectsPending
                          ? "Connecting to workspace…"
                          : runtimeDiscovery.projectsQuery.error
                            ? "Workspace unavailable"
                            : !runtimeProjectId
                              ? "Select a project"
                              : !selectedRuntimeProject
                                ? "Project not found"
                                : runtimeDiscovery.timelinesQuery.error
                                  ? "Timelines unavailable"
                                  : runtimeTimelinesPending
                                    ? "Loading timelines…"
                                    : runtimeTimelineId && !selectedRuntimeTimeline
                                      ? "Timeline not found"
                                      : (runtimeDiscovery.timelinesQuery.data
                                            ?.length ?? 0) === 0
                                        ? "No timelines yet"
                                        : "Select a timeline"}
                      </CardTitle>
                      <CardDescription>
                        {runtimeProjectNotFound
                          ? runtimeProjectNotFound.message
                          : "Choose a project in the header and a timeline above the preview."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {runtimeProjectsPending
                          ? "Loading the projects in your workspace."
                          : runtimeDiscovery.projectsQuery.error?.message ||
                            runtimeDiscovery.timelinesQuery.error?.message ||
                            (runtimeProjectMissing
                              ? "The selected project is not available in this workspace. Choose an existing project."
                              : runtimeTimelinesPending
                                ? "Loading the timelines for this project."
                                : runtimeTimelineMissing
                                  ? "The selected timeline is not available in this project. Choose another timeline."
                                  : "Your editor opens after a project and timeline are selected.")}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </>
        )}
      </div>
    );
  }

  if (mode === "local") {
    const connectionFailed =
      discovery.bridgeDown || !!runtimeConnectorError || !!nativeRecoveryError;
    const recovery = (
      <WorkspaceConnectionRecovery
        projectSlug={localProjectSlug}
        timelineId={localTimelineId}
        failureSummary="The editor could not connect to its configured workspace."
        retrying={discovery.healthQuery.isFetching || runtimeRetrying || nativeRecovery.retrying}
        error={
          nativeRecoveryError ??
          runtimeConnectorError?.message ??
          discovery.healthQuery.error?.message ??
          "The workspace has not responded."
        }
        connectionUrl={typeof location === "undefined" ? null : location.origin}
        onRetry={async () => {
          const attempt = nativeRecovery.beginManualAttempt();
          setRuntimeRetrying(true);
          try {
            await assertNativeEditorConnection();
            await providerSelection?.runtimeReconnect?.();
            await discovery.healthQuery.refetch();
            await discovery.projectsQuery.refetch();
            if (localProjectSlug) await discovery.timelinesQuery.refetch();
            nativeRecovery.completeRecovery(attempt);
          } catch (error) {
            if (currentConnectorScope.current !== attempt.scope) return;
            nativeRecovery.reportFailure();
            setNativeRecoveryError(
              error instanceof Error ? error.message : String(error),
            );
          } finally {
            setRuntimeRetrying(false);
          }
        }}
      />
    );
    const projectDiscoveryPending =
      !discovery.bridgeDown &&
      !(discovery.projectsQuery.error && !discovery.projectsQuery.data) &&
      localProjectListPending &&
      (!localProjectSlug || !selectedLocalProject);

    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-transparent">
        {(!providerSelection || connectionFailed) && selectorsHeader}
        {providerSelection && connectionFailed && recovery}
        {!providerSelection && selectedLocalProject && (
          <div className="px-4 py-2">{timelinePreviewControls}</div>
        )}
        {providerSelection ? (
          <div
            hidden={connectionFailed}
            className="min-h-0 flex-1 overflow-hidden p-2 sm:px-4 sm:pt-2 sm:pb-4 lg:px-6 lg:pt-0 lg:pb-6"
          >
            <VideoEditorProvider
              key={providerSelection.remountKey}
              dataProvider={pageDataProvider ?? providerSelection.dataProvider}
              projectId={providerSelection.projectId}
              projectSlug={providerSelection.projectSlug}
              timelineId={providerSelection.timelineId}
              timelineName={providerSelection.timelineName}
              userId={providerSelection.userId}
              onSaveStatusChange={setMountedSaveStatus}
              onPendingWorkChange={onPendingWorkChange}
              extensions={resolvedExtensions}
              timelineOverlaysEnabled={timelineOverlaysEnabled}
              extensionHostEnabled={extensionReleaseFlags.extensionHostEnabled}
              extensionReleaseRevision={
                extensionReleaseFlags.configurationRevision
              }
            >
              <AstridVideoEditorShell
                mode="full"
                timelineId={providerSelection.timelineId}
                onCreateTimeline={() => navigate("/")}
                headerNavigationControls={
                  hasGlobalHeader ? undefined : projectHeaderControls
                }
                previewNavigationControls={timelinePreviewControls}
                navigationMode={isHomeTool ? "tools" : "home"}
                showHeader={!hasGlobalHeader}
              />
            </VideoEditorProvider>
          </div>
        ) : (
          <>
            <div className="flex flex-1 items-center justify-center px-6">
              {discovery.healthQuery.isLoading ? (
                <div className="w-full max-w-4xl space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : discovery.bridgeDown ? (
                recovery
              ) : discovery.projectsQuery.error &&
                (!discovery.projectsQuery.data ||
                  !localProjectSlug ||
                  !selectedLocalProject) ? (
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>Unable to load Astrid projects</CardTitle>
                    <CardDescription>
                      Retry project discovery from the selector above.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="button"
                      onClick={() => void discovery.projectsQuery.refetch()}
                    >
                      Retry project discovery
                    </Button>
                  </CardContent>
                </Card>
              ) : projectDiscoveryPending ? (
                <Card className="w-full max-w-md" role="status">
                  <CardHeader className="flex-row items-center gap-3">
                    <MinkCircle
                      reducedMotion={prefersReducedMotion}
                      size={48}
                    />
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="text-lg">
                        {localProjectSlug
                          ? "Loading project…"
                          : "Loading projects…"}
                      </CardTitle>
                      <CardDescription>
                        Restoring the local Astrid workspace selection.
                      </CardDescription>
                    </div>
                  </CardHeader>
                </Card>
              ) : !localProjectSlug ? (
                localProjects?.length === 0 ? (
                  <Card className="w-full max-w-md">
                    <CardHeader>
                      <CardTitle>No projects yet</CardTitle>
                      <CardDescription>
                        Create a project with New project above, then open its
                        timeline here.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                ) : (
                  <Card className="w-full max-w-md">
                    <CardHeader>
                      <CardTitle>Select a project and timeline</CardTitle>
                      <CardDescription>
                        Choose a local Astrid project from the selector above.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )
              ) : !selectedLocalProject ? (
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>Project not found</CardTitle>
                    <CardDescription>
                      “{localProjectSlug}” is not in the local Astrid workspace.
                      Choose a project above or create one.
                    </CardDescription>
                  </CardHeader>
                </Card>
              ) : discovery.timelinesQuery.isLoading || localTimelinesPending ? (
                <Card className="w-full max-w-md" role="status">
                  <CardHeader>
                    <CardTitle>Loading timelines…</CardTitle>
                    <CardDescription>Reading this project's timelines from the workspace.</CardDescription>
                  </CardHeader>
                </Card>
              ) : discovery.timelinesQuery.error ? (
                <Card className="w-full max-w-md" role="alert">
                  <CardHeader>
                    <CardTitle>Timelines unavailable</CardTitle>
                    <CardDescription>{discovery.timelinesQuery.error.message}</CardDescription>
                  </CardHeader>
                  <CardContent><Button onClick={() => void discovery.timelinesQuery.refetch()}>Retry timeline discovery</Button></CardContent>
                </Card>
              ) : !localTimelineId ? (
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>No timeline yet</CardTitle>
                    <CardDescription>
                      Create a blank timeline for this project to open it in the
                      editor.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      type="button"
                      onClick={() => void handleCreateFirstTimeline()}
                      disabled={!localProjectId || creatingFirstTimeline}
                    >
                      {creatingFirstTimeline
                        ? "Creating timeline…"
                        : "Create first timeline"}
                    </Button>
                    {firstTimelineError && (
                      <p className="mt-3 text-xs text-destructive" role="alert">
                        Timeline setup failed ({firstTimelineError}). Retry here
                        or check the connected Astrid Runtime.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card className="w-full max-w-md">
                  <CardHeader>
                    <CardTitle>Timeline not found</CardTitle>
                    <CardDescription>
                      No such project/timeline under the bridge projects root.
                    </CardDescription>
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
