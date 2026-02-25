import { useState, useEffect, useCallback, useRef } from 'react';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import type { TrainingDataVideo } from './types';

/**
 * Manages signed URL caching for training data videos.
 * Videos are stored in a private bucket, so we need signed URLs.
 * URLs are loaded asynchronously in batches and cached in state.
 */
export function useVideoUrlCache(videos: TrainingDataVideo[]) {
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const [invalidVideos, setInvalidVideos] = useState<Set<string>>(new Set());
  const videoUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    videoUrlsRef.current = videoUrls;
  }, [videoUrls]);

  // Preload video URLs when videos change
  useEffect(() => {
    const loadVideoUrls = async () => {
      // Only process videos that don't have URLs yet
      const videosNeedingUrls = videos.filter(video => !videoUrlsRef.current[video.id]);

      if (videosNeedingUrls.length === 0) return;

      const newUrls: Record<string, string> = {};

      // Process videos in batches to avoid overwhelming the API
      const batchSize = 10;
      for (let i = 0; i < videosNeedingUrls.length; i += batchSize) {
        const batch = videosNeedingUrls.slice(i, i + batchSize);

        const urlPromises = batch.map(async (video) => {
          const { data, error } = await supabase().storage
            .from('training-data')
            .createSignedUrl(video.storageLocation, 3600); // 1 hour expiry

          if (!error && data?.signedUrl) {
            newUrls[video.id] = data.signedUrl;
          }
        });

        await Promise.all(urlPromises);

        if (Object.keys(newUrls).length > 0) {
          setVideoUrls(prev => {
            const next = {
              ...prev,
              ...newUrls
            };
            videoUrlsRef.current = next;
            return next;
          });
        }
      }
    };

    if (videos.length > 0) {
      loadVideoUrls();
    }
  }, [videos]);

  const getVideoUrl = useCallback((video: TrainingDataVideo): string => {
    if (invalidVideos.has(video.id)) {
      return '';
    }
    return videoUrls[video.id] || '';
  }, [videoUrls, invalidVideos]);

  const markVideoAsInvalid = useCallback((videoId: string) => {
    setInvalidVideos(prev => new Set([...prev, videoId]));
  }, []);

  const clearUrlCache = useCallback((videoId: string) => {
    setVideoUrls(prev => {
      const newUrls = { ...prev };
      delete newUrls[videoId];
      return newUrls;
    });
  }, []);

  return {
    getVideoUrl,
    markVideoAsInvalid,
    clearUrlCache,
  };
}
