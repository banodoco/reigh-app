import { useQuery } from '@tanstack/react-query';
import { generationQueryKeys } from '@/shared/lib/queryKeys/generations';
import { useSmartPollingConfig } from './useSmartPolling';
import {
  fetchDerivedItemsFromRepository,
  type DerivedItem,
} from '@/domains/generation/repository/derivedItemsRepository';

export type { DerivedItem } from '@/domains/generation/repository/derivedItemsRepository';

export function useDerivedItems(
  sourceGenerationId: string | null,
  enabled: boolean = true,
) {
  const queryKey = generationQueryKeys.derived(sourceGenerationId ?? 'none');
  const smartPollingConfig = useSmartPollingConfig(queryKey);

  return useQuery<DerivedItem[], Error>({
    queryKey,
    queryFn: () => fetchDerivedItemsFromRepository(sourceGenerationId),
    enabled: Boolean(sourceGenerationId) && enabled,
    gcTime: 5 * 60 * 1000,
    ...smartPollingConfig,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
