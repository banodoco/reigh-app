import { useEffect } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z, type ZodType } from 'zod';
import {
  BRIDGE_REQUEST_TIMEOUT_MS,
  bridgeHealthSchema,
  bridgeProjectsSchema,
  bridgeTimelinesSchema,
  parseBridgePayload,
  runtimeProjectPageSchema,
} from '@/tools/video-editor/data/bridgeContract.ts';
import type {
  BridgeHealthPayload,
  BridgeProjectsPayload,
  BridgeTimelinesPayload,
} from '@/tools/video-editor/data/bridgeContract.ts';
import type { AstridBridgeRequestObservation } from '@/tools/video-editor/data/AstridBridgeDataProvider.ts';
import {
  astridProjectCollectionPath,
  astridTimelineCollectionPath,
  isAstridWorkspaceV1,
} from '@/integrations/astrid/workspaceV1.ts';

/**
 * Astrid local-bridge discovery: health + projects + the selected local
 * project's timelines, consumed by the editor project/timeline selectors.
 *
 * Fetch policy (overriding the app-wide 5-minute default cache — see
 * `src/app/providers/queryClient.ts` — with `staleTime: 0`):
 *
 * - Health runs whenever the current selection is local, so the page always
 *   knows whether the bridge is reachable (e.g. to auto-pick a timeline).
 * - Projects/timelines are fetched for the selected local project whenever
 *   the bridge is healthy (timelines additionally need a project slug).
 * - Opening the selector dropdowns refetches projects and timelines, so a
 *   bridge started while the editor is open shows up immediately.
 * - While a dropdown is open and the current selection is local, health
 *   polls every 3s while the bridge is down, and projects poll every 3s
 *   while the bridge is down or the projects list is empty. Polling stops
 *   once the data is healthy/non-empty or the dropdown closes.
 */
export const LOCAL_BRIDGE_BASE_URL = '/api/astrid';

export const BRIDGE_DISCOVERY_POLL_MS = 3_000;

/** Runtime timeline list items are the same identity fields as the legacy
 * bridge rows, but are wrapped in the neutral Runtime page envelope. */
const runtimeTimelinePageSchema = z.strictObject({
  items: z.array(z.looseObject({
    timeline_id: z.string().min(1),
    timeline_ulid: z.string().optional(),
    slug: z.string().optional(),
    name: z.string().min(1),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    is_default: z.boolean().optional(),
    is_shot: z.boolean().optional(),
  })),
  next_cursor: z.string().min(1).nullable(),
});

const runtimeHealthSchema = z.looseObject({
  status: z.literal('ok'),
});

function annotateAstridTimelines<T extends {
  timeline_id: string;
  timeline_ulid?: string;
  slug?: string;
  created_at?: string;
  updated_at?: string;
  is_default?: boolean;
}>(timelines: T[], defaultTimelineRef?: string) {
  const hasExplicitDefault = typeof defaultTimelineRef === 'string' && defaultTimelineRef.length > 0;
  return timelines.map((timeline) => ({
    ...timeline,
    is_shot: timeline.slug?.startsWith('shot-') === true,
    // Project metadata is authoritative when present. In particular, do not
    // retain a stale server-side flag or infer `slug === "main"` as a second
    // primary alongside the project default.
    is_default: hasExplicitDefault
      ? (
          timeline.timeline_id === defaultTimelineRef
          || timeline.timeline_ulid === defaultTimelineRef
        )
      : timeline.is_default === true
        || (timeline.is_default === undefined && timeline.slug === 'main'),
  }));
}

function projectDefaultTimelineRef(project: {
  default_timeline_id?: string;
  metadata?: Record<string, unknown>;
} | undefined): string | undefined {
  if (project?.default_timeline_id) return project.default_timeline_id;
  const metadataValue = project?.metadata?.default_timeline_id;
  return typeof metadataValue === 'string' && metadataValue.length > 0
    ? metadataValue
    : undefined;
}

async function fetchBridgeJson<Schema extends ZodType>(
  path: string,
  schema: Schema,
  what: string,
  onBridgeRequest?: (event: AstridBridgeRequestObservation) => void,
): Promise<z.infer<Schema>> {
  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(`${LOCAL_BRIDGE_BASE_URL}${path}`, {
      signal: AbortSignal.timeout(BRIDGE_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    onBridgeRequest?.({
      outcome: 'failure',
      durationMs: Math.max(0, performance.now() - startedAt),
      errorClass: error instanceof DOMException && error.name === 'TimeoutError'
        ? 'bridge.timeout'
        : 'bridge.http_error',
    });
    throw error;
  }
  if (!response.ok) {
    onBridgeRequest?.({
      outcome: 'failure',
      durationMs: Math.max(0, performance.now() - startedAt),
      errorClass: 'bridge.http_error',
    });
    throw new Error(`Astrid bridge request failed: ${response.status} ${response.statusText}`);
  }
  try {
    const payload = parseBridgePayload(schema, await response.json(), what);
    onBridgeRequest?.({
      outcome: 'success',
      durationMs: Math.max(0, performance.now() - startedAt),
    });
    return payload;
  } catch (error) {
    onBridgeRequest?.({
      outcome: 'failure',
      durationMs: Math.max(0, performance.now() - startedAt),
      errorClass: 'bridge.invalid_response',
    });
    throw error;
  }
}

export interface UseAstridBridgeDiscoveryOptions {
  /** Whether any of the editor selector dropdowns is open. */
  open: boolean;
  /** Whether the current selection is a local (Astrid) one. */
  currentLocal: boolean;
  /** Slug of the selected local project (drives the timelines fetch). */
  selectedProjectSlug: string | null;
  /** Host-owned, privacy-bounded observation of actual discovery IO only. */
  onBridgeRequest?: (event: AstridBridgeRequestObservation) => void;
}

export interface UseAstridBridgeDiscoveryResult {
  healthQuery: UseQueryResult<BridgeHealthPayload['ok'], Error>;
  projectsQuery: UseQueryResult<BridgeProjectsPayload, Error>;
  timelinesQuery: UseQueryResult<BridgeTimelinesPayload, Error>;
  /** True once health reports the bridge reachable. */
  bridgeHealthy: boolean;
  /** True when health failed or reported `ok: false`. */
  bridgeDown: boolean;
  /** True when the projects list loaded empty (or has not loaded yet). */
  projectsEmpty: boolean;
}

export function useAstridBridgeDiscovery({
  open,
  currentLocal,
  selectedProjectSlug,
  onBridgeRequest,
}: UseAstridBridgeDiscoveryOptions): UseAstridBridgeDiscoveryResult {
  const healthQuery = useQuery({
    queryKey: ['astrid-bridge', 'health'],
    queryFn: async () => {
      if (isAstridWorkspaceV1) {
        const payload = await fetchBridgeJson(
          '/v1/health',
          runtimeHealthSchema,
          'health response',
          onBridgeRequest,
        );
        return payload.status === 'ok';
      }
      const payload = await fetchBridgeJson(
        '/health',
        bridgeHealthSchema,
        'health response',
        onBridgeRequest,
      );
      return payload.ok === true;
    },
    enabled: currentLocal || open,
    staleTime: 0,
    retry: 0,
    // Poll only while the bridge is down AND a dropdown is open over a local
    // selection. Once healthy the interval drops to false.
    refetchInterval: (query) =>
      open && currentLocal && (query.state.status === 'error' || query.state.data === false)
        ? BRIDGE_DISCOVERY_POLL_MS
        : false,
  });

  const bridgeHealthy = healthQuery.data === true;
  const bridgeDown = healthQuery.isError || healthQuery.data === false;

  const projectsQuery = useQuery({
    queryKey: ['astrid-bridge', 'projects'],
    queryFn: async () => {
      if (isAstridWorkspaceV1) {
        const payload = await fetchBridgeJson(
          `${astridProjectCollectionPath()}?limit=200`,
          runtimeProjectPageSchema,
          'projects list',
          onBridgeRequest,
        );
        return {
          projects: payload.items.map((project) => ({
            slug: project.slug,
            name: project.name,
            project_id: project.project_id,
            version: project.version,
            metadata: project.metadata,
          })),
        };
      }
      return fetchBridgeJson(
        '/projects',
        bridgeProjectsSchema,
        'projects list',
        onBridgeRequest,
      );
    },
    enabled: (currentLocal || open) && bridgeHealthy,
    staleTime: 0,
    retry: 0,
    // Poll while the dropdown is open over a local selection and the bridge is
    // down (waiting for it to come up) or the projects list is still empty.
    refetchInterval: (query) => {
      const projectsEmpty = (query.state.data?.projects?.length ?? 0) === 0;
      return open && currentLocal && (bridgeDown || projectsEmpty)
        ? BRIDGE_DISCOVERY_POLL_MS
        : false;
    },
  });

  const projectsEmpty = (projectsQuery.data?.projects?.length ?? 0) === 0;
  const selectedProject = projectsQuery.data?.projects?.find(
    (project) => project.slug === selectedProjectSlug,
  );
  const selectedProjectDefaultTimeline = projectDefaultTimelineRef(selectedProject);

  const timelinesQuery = useQuery({
    queryKey: [
      'astrid-bridge',
      'projects',
      selectedProjectSlug ?? null,
      'timelines',
      selectedProjectDefaultTimeline ?? null,
    ],
    queryFn: async () => {
      if (isAstridWorkspaceV1) {
        const payload = await fetchBridgeJson(
          `${astridTimelineCollectionPath(selectedProjectSlug!)}?limit=200`,
          runtimeTimelinePageSchema,
          'timelines list',
          onBridgeRequest,
        );
        return {
          timelines: annotateAstridTimelines(payload.items, selectedProjectDefaultTimeline),
        };
      }
      const payload = await fetchBridgeJson(
        `/projects/${encodeURIComponent(selectedProjectSlug!)}/timelines`,
        bridgeTimelinesSchema,
        'timelines list',
        onBridgeRequest,
      );
      return {
        timelines: annotateAstridTimelines(payload.timelines ?? [], selectedProjectDefaultTimeline),
      };
    },
    enabled: bridgeHealthy && Boolean(selectedProjectSlug),
    staleTime: 0,
    retry: 0,
  });

  // Refetch the discovery lists when a dropdown opens so a bridge started (or
  // a project created) while the editor was open shows up immediately. Gated
  // on the bridge being healthy: `refetch()` bypasses the `enabled` check, so
  // an unconditional refetch would violate the "projects only when healthy"
  // contract while the bridge is down (the health poll covers recovery).
  useEffect(() => {
    if (open) {
      // A one-shot discovery pass whenever the picker opens, in ANY mode: the
      // unified selector is the mode switch, so app-mode users opening the
      // dropdown must see the current local projects (or the launch hint).
      void healthQuery.refetch();
      if (bridgeHealthy) {
        void projectsQuery.refetch();
        if (selectedProjectSlug) {
          void timelinesQuery.refetch();
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return {
    healthQuery,
    projectsQuery,
    timelinesQuery,
    bridgeHealthy,
    bridgeDown,
    projectsEmpty,
  };
}
