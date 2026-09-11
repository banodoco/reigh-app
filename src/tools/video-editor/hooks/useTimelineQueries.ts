import { useQuery } from '@tanstack/react-query';
import { loadTimelineJsonFromProvider } from '@/tools/video-editor/lib/timeline-data.ts';
import { assetRegistryQueryKey, timelineQueryKey } from '@/tools/video-editor/hooks/useTimeline.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';

export const DEFAULT_TIMELINE_REFRESH_INTERVAL_MS = 30_000;

type RefreshableDataProvider = DataProvider & {
  readonly refreshIntervalMs?: number;
};

/**
 * Runtime document events do not currently have a public cursor API. The
 * versioned timeline read is therefore the canonical catch-up mechanism;
 * reconnect refetches it and usePollSync gates adoption by configVersion.
 */
export function getTimelineRefreshInterval(provider: DataProvider): number {
  const candidate = (provider as RefreshableDataProvider).refreshIntervalMs;
  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? candidate
    : DEFAULT_TIMELINE_REFRESH_INTERVAL_MS;
}

export function getTimelineRefreshOptions(provider: DataProvider) {
  return {
    refetchInterval: getTimelineRefreshInterval(provider),
    refetchOnReconnect: true,
  } as const;
}

export function useTimelineQueries(
  provider: DataProvider,
  timelineId: string,
  resolveAssetUrl?: (file: string) => Promise<string>,
) {
  const refreshOptions = getTimelineRefreshOptions(provider);
  const timelineQuery = useQuery({
    queryKey: timelineQueryKey(timelineId),
    enabled: Boolean(timelineId),
    queryFn: () => loadTimelineJsonFromProvider(provider, timelineId, resolveAssetUrl),
    ...refreshOptions,
  });

  const assetRegistryQuery = useQuery({
    queryKey: assetRegistryQueryKey(timelineId),
    enabled: Boolean(timelineId),
    queryFn: () => provider.loadAssetRegistry(timelineId),
    ...refreshOptions,
  });

  return {
    timelineQuery,
    assetRegistryQuery,
  };
}
