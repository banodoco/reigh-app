import { createContext, useContext } from 'react';
import { hasLocalModeUrlParams } from '@/shared/dev/devSession';
import { getRuntimeDocumentProjectId } from './runtimeDocument';

export interface RuntimeAuthority {
  /** True when the current surface is owned by Astrid/Workspace Runtime. */
  runtimeAuthority: boolean;
  /** Canonical Runtime project id, once URL selection has resolved. */
  runtimeProjectId: string | null;
}

export const RuntimeAuthorityContext = createContext<RuntimeAuthority | null>(null);

export function resolveRuntimeAuthority(
  search = typeof window === 'undefined' ? '' : window.location.search,
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
): RuntimeAuthority {
  const runtimeProjectId = getRuntimeDocumentProjectId(search, pathname);
  return {
    runtimeAuthority: runtimeProjectId !== null || hasLocalModeUrlParams(search),
    runtimeProjectId,
  };
}

/**
 * Read the nearest explicit authority. Outside a route provider, local and
 * explicit `runtime=1` document URLs are still authoritative. No generation-id
 * shape is used to choose a backend.
 */
export function useRuntimeAuthority(): RuntimeAuthority {
  const provided = useContext(RuntimeAuthorityContext);
  if (provided) return provided;

  return resolveRuntimeAuthority();
}
