/**
 * useShotFinalVideos - Batch-fetches the latest final video for each shot in a project.
 *
 * Returns a map of shotId → ShotFinalVideo for shots that have
 * a completed final video. Used by the shot list to show video previews.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { finalVideoQueryKeys } from '@/shared/lib/queryKeys/finalVideos';

export interface ShotFinalVideo {
  id: string;
  location: string;
  thumbnailUrl: string | null;
}

export function useShotFinalVideos(projectId: string | null) {
  const { data: rawData, isLoading } = useQuery({
    queryKey: finalVideoQueryKeys.byProject(projectId!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shot_final_videos')
        .select('id, location, thumbnail_url, shot_id, created_at')
        .eq('project_id', projectId!)
        .not('location', 'is', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[useShotFinalVideos] Error:', error);
        return [];
      }
      return data || [];
    },
    enabled: !!projectId,
    staleTime: 30_000,
  });

  // Build map: shotId → latest final video (first per shot since ordered by created_at desc)
  const finalVideoMap = useMemo(() => {
    const map = new Map<string, ShotFinalVideo>();
    if (!rawData) return map;

    for (const row of rawData) {
      const shotId = typeof (row as Record<string, unknown>).shot_id === 'string'
        ? (row as Record<string, unknown>).shot_id as string
        : null;
      const location = typeof row.location === 'string' ? row.location : null;
      const id = typeof row.id === 'string' ? row.id : null;

      if (shotId && id && location && !map.has(shotId)) {
        map.set(shotId, {
          id,
          location,
          thumbnailUrl: row.thumbnail_url || null,
        });
      }
    }
    return map;
  }, [rawData]);

  return { finalVideoMap, isLoading };
}
