import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { CreatorProfile, SharedData } from '../types';

interface UseSharePageDataResult {
  loading: boolean;
  error: string | null;
  shareData: SharedData | null;
  creator: CreatorProfile | null;
}

interface SharedShotDataRpcPayload {
  shot_id: string;
  shot_name: string;
  generation: SharedData['generation'];
  images: SharedData['images'] | null;
  settings: SharedData['settings'];
  creator_id: string | null;
  view_count: number;
  creator_username?: string | null;
  creator_name?: string | null;
  creator_avatar_url?: string | null;
  error?: string;
}

function toSharedShotPayload(value: unknown): SharedShotDataRpcPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const payload = value as Partial<SharedShotDataRpcPayload>;
  if (
    typeof payload.shot_id !== 'string' ||
    typeof payload.shot_name !== 'string' ||
    typeof payload.view_count !== 'number' ||
    !('generation' in payload) ||
    !('settings' in payload)
  ) {
    return null;
  }

  return payload as SharedShotDataRpcPayload;
}

export function useSharePageData(shareId: string | undefined): UseSharePageDataResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<SharedData | null>(null);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);

  const loadShareData = useCallback(async () => {
    if (!shareId) {
      setError('Invalid share link');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase().rpc('get_shared_shot_data', { share_slug_param: shareId });

      const sharePayload = toSharedShotPayload(data);
      if (fetchError) {
        normalizeAndPresentError(fetchError, { context: 'SharePage', showToast: false });
        setError('Failed to load shared generation');
        setLoading(false);
        return;
      }

      if (!sharePayload || sharePayload.error) {
        setError('Share not found or no longer available');
        setLoading(false);
        return;
      }

      void supabase().rpc('increment_share_view_count', {
        share_slug_param: shareId,
      });

      setShareData({
        shot_id: sharePayload.shot_id,
        shot_name: sharePayload.shot_name,
        generation: sharePayload.generation,
        images: sharePayload.images || [],
        settings: sharePayload.settings,
        creator_id: sharePayload.creator_id,
        view_count: sharePayload.view_count,
        creator_username: sharePayload.creator_username ?? null,
        creator_name: sharePayload.creator_name ?? null,
        creator_avatar_url: sharePayload.creator_avatar_url ?? null,
      });

      setCreator({
        name: sharePayload.creator_name ?? null,
        username: sharePayload.creator_username ?? null,
        avatar_url: sharePayload.creator_avatar_url ?? null,
      });
    } catch (err) {
      normalizeAndPresentError(err, { context: 'SharePage', showToast: false });
      setError('Failed to load shared generation');
    } finally {
      setLoading(false);
    }
  }, [shareId]);

  useEffect(() => {
    loadShareData();
  }, [loadShareData]);

  return { loading, error, shareData, creator };
}
