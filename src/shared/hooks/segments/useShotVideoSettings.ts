/**
 * useShotVideoSettings - Query hook for shot-level video settings
 *
 * Fetches settings from shots.settings['travel-between-images'].
 * These serve as defaults for all segments in the shot.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/shared/lib/queryKeys';
import { readShotSettings, type ShotVideoSettings } from '@/shared/utils/settingsMigration';

interface UseShotVideoSettingsReturn {
  data: ShotVideoSettings | null | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

export function useShotVideoSettings(
  shotId: string | null | undefined
): UseShotVideoSettingsReturn {
  const query = useQuery({
    queryKey: queryKeys.shots.batchSettings(shotId || ''),
    queryFn: async (): Promise<ShotVideoSettings | null> => {
      if (!shotId) return null;

      const { data, error } = await supabase
        .from('shots')
        .select('settings')
        .eq('id', shotId)
        .single();

      if (error) {
        console.error('[useShotVideoSettings] Error fetching:', error);
        return null;
      }

      const allSettings = data?.settings as Record<string, unknown>;
      const rawSettings = (allSettings?.['travel-between-images'] ?? {}) as Record<string, unknown>;

      return readShotSettings(rawSettings);
    },
    enabled: !!shotId,
    staleTime: 0, // Always refetch - settings can change from BatchSettingsForm
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
