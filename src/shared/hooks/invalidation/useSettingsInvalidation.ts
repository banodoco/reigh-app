/**
 * useSettingsInvalidation.ts
 *
 * Centralized hook for invalidating settings-related React Query caches.
 *
 * Scopes:
 * - 'tool': Tool settings for a specific tool/project
 * - 'segment': Segment settings
 * - 'user': User-level settings
 * - 'pair': Pair metadata (segment editor)
 */

import { useQueryClient, QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { queryKeys } from '../../lib/queryKeys';

export type SettingsInvalidationScope = 'tool' | 'segment' | 'user' | 'pair' | 'all';

export interface SettingsInvalidationOptions {
  /** Which settings to invalidate */
  scope: SettingsInvalidationScope;
  /** Debug reason for logging. Required for traceability. */
  reason: string;
  /** Tool ID - required for 'tool' scope */
  toolId?: string;
  /** Project ID - required for 'tool' scope */
  projectId?: string;
  /** Shot ID - optional for tool scope */
  shotId?: string;
  /** Pair ID - required for 'pair' scope */
  pairId?: string;
}

/**
 * Internal helper that performs the actual invalidation.
 */
function performSettingsInvalidation(
  queryClient: QueryClient,
  options: SettingsInvalidationOptions
): void {
  const { scope, reason, toolId, projectId, shotId, pairId } = options;

  if ((scope === 'tool' || scope === 'all') && toolId && projectId) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.settings.tool(toolId, projectId, shotId),
    });
  }

  if ((scope === 'pair' || scope === 'all') && pairId) {
    queryClient.invalidateQueries({
      queryKey: queryKeys.segments.pairMetadata(pairId),
    });
  }

  if (scope === 'user' || scope === 'all') {
    queryClient.invalidateQueries({ queryKey: queryKeys.settings.user });
  }
}

/**
 * Hook that returns a stable settings invalidation function.
 * Use this in React components/hooks.
 *
 * @internal Not exported - currently unused. If needed in the future,
 * add export back and update the barrel file.
 */
function useInvalidateSettings() {
  const queryClient = useQueryClient();

  return useCallback((options: SettingsInvalidationOptions) => {
    performSettingsInvalidation(queryClient, options);
  }, [queryClient]);
}

// Keep for potential future use
void useInvalidateSettings;

/**
 * Non-hook version for use outside React components.
 * Requires passing in the queryClient.
 *
 * @internal Not exported - currently unused. If needed in the future,
 * add export back and update the barrel file.
 */
function invalidateSettingsSync(
  queryClient: QueryClient,
  options: SettingsInvalidationOptions
): void {
  performSettingsInvalidation(queryClient, options);
}

// Keep for potential future use
void invalidateSettingsSync;
