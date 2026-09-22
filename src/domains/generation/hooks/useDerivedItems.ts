import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSmartPollingConfig } from '@/shared/hooks/useSmartPolling';
import {
  mapDerivedItemsFromGenerationDetail,
  type DerivedItem,
} from '@/domains/generation/repository/derivedItemsRepository';
import { fetchGenerationDetailQuery } from '@/shared/hooks/generations/useGenerationDetail';
import { getProjectSelectionFallbackId } from '@/shared/contexts/projectSelectionStore';
import { useRuntimeAuthority } from '@/app/runtime/runtimeAuthority';
import type { RuntimeGenerationDetail } from '@/integrations/runtime/generationAccess';
import { EDIT_VARIANT_TYPES } from '@/shared/constants/variantTypes';

export type { DerivedItem } from '@/domains/generation/repository/derivedItemsRepository';

function mapRuntimeDerivedItems(detail: RuntimeGenerationDetail): DerivedItem[] {
  return detail.variants
    .filter((variant) => (
      !variant.is_primary
      && variant.variant_type !== null
      && EDIT_VARIANT_TYPES.includes(variant.variant_type as never)
    ))
    .map((variant) => {
      const mediaType = typeof variant.params.media_type === 'string'
        ? variant.params.media_type
        : typeof variant.params.content_type === 'string'
          ? variant.params.content_type
          : null;
      const isVideo = mediaType?.toLowerCase().startsWith('video/') ?? false;
      return {
        id: variant.id,
        thumbUrl: isVideo ? null : variant.media_id,
        url: variant.media_id,
        createdAt: variant.created_at,
        derivedCount: 0,
        starred: false,
        prompt: typeof variant.params.prompt === 'string' ? variant.params.prompt : undefined,
        itemType: 'variant' as const,
        variantType: variant.variant_type ?? null,
        variantName: variant.name ?? null,
        viewedAt: null,
      };
    });
}

export function useDerivedItems(
  sourceGenerationId: string | null,
  enabled: boolean = true,
) {
  const queryClient = useQueryClient();
  const authority = useRuntimeAuthority();
  const projectId = authority.runtimeAuthority
    ? authority.runtimeProjectId
    : getProjectSelectionFallbackId();
  const queryProjectId = projectId ?? 'pending';
  const queryKey = [
    authority.runtimeAuthority ? 'runtime' : 'supabase',
    'derived-items',
    queryProjectId,
    sourceGenerationId ?? 'none',
  ] as const;
  const smartPollingConfig = useSmartPollingConfig(queryKey);

  return useQuery<DerivedItem[], Error>({
    queryKey,
    queryFn: async () => {
      if (!sourceGenerationId) return [];
      if (!projectId) return [];
      const detail = await fetchGenerationDetailQuery(
        queryClient,
        sourceGenerationId,
        authority,
        projectId,
      );
      if (!detail) return [];
      return authority.runtimeAuthority
        ? mapRuntimeDerivedItems(detail as RuntimeGenerationDetail)
        : mapDerivedItemsFromGenerationDetail(detail as Parameters<typeof mapDerivedItemsFromGenerationDetail>[0], projectId);
    },
    enabled: Boolean(sourceGenerationId) && Boolean(projectId) && enabled,
    gcTime: 5 * 60 * 1000,
    ...smartPollingConfig,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
