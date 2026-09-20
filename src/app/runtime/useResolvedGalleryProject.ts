import { useMemo } from 'react';
import { getRuntimeDocumentProjectId } from './runtimeDocument';
import { getLocalProjectSlug } from '@/shared/dev/devSession';
import { isAstridWorkspaceV1 } from '@/integrations/astrid/workspaceV1';
import {
  useAstridBridgeDiscovery,
  type UseAstridBridgeDiscoveryResult,
} from '@/tools/video-editor/hooks/useAstridBridgeDiscovery';

export type GalleryProjectResolutionStatus =
  | 'not-applicable'
  | 'pending'
  | 'resolved'
  | 'error';

export interface ResolvedGalleryProject {
  /** Canonical Runtime project id when this route is Runtime-owned. */
  projectId: string | null;
  /** True when the gallery must not fall back to the legacy generation API. */
  runtimeAuthority: boolean;
  status: GalleryProjectResolutionStatus;
  isResolving: boolean;
  error: Error | null;
  /** The URL-owned local selector, useful for diagnostics and error copy. */
  selector: string | null;
}

type DiscoverableProject = {
  slug?: string;
  project_id?: string;
};

export function findRuntimeProjectId(
  projects: DiscoverableProject[] | undefined,
  selector: string,
): string | null {
  const project = projects?.find((candidate) => candidate.slug === selector);
  return project?.project_id?.trim() || null;
}

function discoveryError(
  discovery: UseAstridBridgeDiscoveryResult,
  selector: string,
  projects: DiscoverableProject[] | undefined,
  isResolving: boolean,
): Error | null {
  if (isResolving) return null;
  if (discovery.healthQuery.error) return discovery.healthQuery.error;
  if (discovery.projectsQuery.error) return discovery.projectsQuery.error;
  if (discovery.bridgeDown) {
    return new Error('Astrid Runtime is unavailable while resolving the local project.');
  }
  if (discovery.projectsQuery.data && !findRuntimeProjectId(projects, selector)) {
    return new Error(`Astrid Runtime project "${selector}" was not found.`);
  }
  return null;
}

/**
 * Resolve a URL-owned local project before any gallery query is enabled.
 *
 * `localProject` is a stable human selector, not the Runtime primary key.
 * Keeping this boundary here prevents the gallery from silently falling back
 * to the retired slug-based generation API while Runtime discovery is pending
 * or unavailable.
 */
export function useResolvedGalleryProject(
  search: string,
  pathname: string,
): ResolvedGalleryProject {
  const localProjectSlug = getLocalProjectSlug(search);
  const explicitRuntimeProjectId = getRuntimeDocumentProjectId(search, pathname);
  const localRuntimeMode = isAstridWorkspaceV1
    && explicitRuntimeProjectId === null
    && localProjectSlug !== null;

  const discovery = useAstridBridgeDiscovery({
    open: false,
    currentLocal: localRuntimeMode,
    // This hook only needs project discovery. Passing null prevents the
    // editor-only timeline discovery request from being coupled to galleries.
    selectedProjectSlug: null,
  });

  const projects = discovery.projectsQuery.data?.projects as DiscoverableProject[] | undefined;
  const discoveredProjectId = localProjectSlug
    ? findRuntimeProjectId(projects, localProjectSlug)
    : null;

  const isResolving = localRuntimeMode
    && discoveredProjectId === null
    && !discovery.healthQuery.error
    && !discovery.projectsQuery.error
    && !discovery.bridgeDown
    && (
      discovery.healthQuery.isLoading
      || discovery.projectsQuery.isLoading
      || !discovery.bridgeHealthy
    );
  const error = localRuntimeMode && localProjectSlug
    ? discoveryError(discovery, localProjectSlug, projects, isResolving)
    : null;

  return useMemo(() => {
    if (explicitRuntimeProjectId) {
      return {
        projectId: explicitRuntimeProjectId,
        runtimeAuthority: true,
        status: 'resolved' as const,
        isResolving: false,
        error: null,
        selector: null,
      };
    }
    if (!localRuntimeMode || !localProjectSlug) {
      return {
        projectId: null,
        runtimeAuthority: false,
        status: 'not-applicable' as const,
        isResolving: false,
        error: null,
        selector: localProjectSlug,
      };
    }
    if (discoveredProjectId) {
      return {
        projectId: discoveredProjectId,
        runtimeAuthority: true,
        status: 'resolved' as const,
        isResolving: false,
        error: null,
        selector: localProjectSlug,
      };
    }
    return {
      projectId: null,
      runtimeAuthority: true,
      status: error ? ('error' as const) : ('pending' as const),
      isResolving: !error,
      error,
      selector: localProjectSlug,
    };
  }, [discoveredProjectId, error, explicitRuntimeProjectId, localProjectSlug, localRuntimeMode]);
}
