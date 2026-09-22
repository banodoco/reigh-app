/**
 * Background Thumbnail Generator Hook
 * 
 * Automatically generates thumbnails for videos that don't have them.
 * Processes videos one at a time in the background without blocking the UI.
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';
import { generateAndUploadThumbnail } from '@/shared/lib/media/videoThumbnailGenerator';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { isDeferredCloudDataAuthority } from '@/app/runtime/dataAuthority';

interface UseBackgroundThumbnailGeneratorOptions {
  videos: Array<{
    id: string;
    location?: string | null;
    url?: string | null;
    thumbUrl?: string | null;
    isVideo?: boolean;
  }>;
  projectId: string | null;
  enabled?: boolean;
}

interface GenerationStatus {
  generationId: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  error?: string;
}

export function useBackgroundThumbnailGenerator({
  videos,
  projectId,
  enabled = true,
}: UseBackgroundThumbnailGeneratorOptions) {
  const deferredCloudAuthority = isDeferredCloudDataAuthority();
  const queryClient = useQueryClient();
  const [statuses, setStatuses] = useState<Record<string, GenerationStatus>>({});
  const processingRef = useRef(false);
  const queueRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runGenerationRef = useRef(0);

  // A queue belongs to one explicit cloud project and authority. Drop it on
  // scope changes and unmount so a late worker cannot publish into a new
  // gallery or keep a timer alive after the gallery has gone away.
  useEffect(() => {
    return () => {
      runGenerationRef.current += 1;
      queueRef.current = [];
      processingRef.current = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [deferredCloudAuthority, enabled, projectId]);

  // Identify videos without thumbnails
  useEffect(() => {

    if (!deferredCloudAuthority || !enabled || !projectId) {
      return;
    }

    const videosWithoutThumbnails = videos.filter(video => {
      // Debug each video
      const videoUrl = video.location || video.url;
      const hasUrl = !!videoUrl;
      
      // Check if it's a video by looking at the URL extension or isVideo property
      const urlLooksLikeVideo = videoUrl && /\.(mp4|mov|avi|webm|mkv)$/i.test(videoUrl);
      const isDefinitelyVideo = video.isVideo === true || urlLooksLikeVideo;
      
      // A "real thumbnail" is an image file (jpg/png/webp), not another video file
      const thumbIsImageFile = video.thumbUrl && /\.(jpg|jpeg|png|webp|gif)$/i.test(video.thumbUrl);
      const thumbIsDifferentFromVideo = video.thumbUrl && video.thumbUrl !== video.location && video.thumbUrl !== video.url;
      const hasRealThumbnail = thumbIsImageFile && thumbIsDifferentFromVideo;
      
      const currentStatus = statuses[video.id]?.status;
      
      // Must be a video (check isVideo property or URL extension)
      if (!isDefinitelyVideo) return false;
      
      // Must have a video URL
      if (!hasUrl) return false;
      
      // Must NOT have a real image thumbnail (if thumbUrl is .mp4, it's not a real thumbnail!)
      if (hasRealThumbnail) return false;
      
      // Must not already be processed, processing, or errored (avoid retry loops)
      if (currentStatus === 'processing' || currentStatus === 'success' || currentStatus === 'error') return false;
      
      return true;
    });

    if (videosWithoutThumbnails.length > 0) {

      // Add to queue (avoid duplicates)
      const newVideoIds = videosWithoutThumbnails
        .map(v => v.id)
        .filter(id => !queueRef.current.includes(id));
      
      if (newVideoIds.length > 0) {
        queueRef.current = [...queueRef.current, ...newVideoIds];
        
        // Mark as pending
        const newStatuses: Record<string, GenerationStatus> = {};
        newVideoIds.forEach(id => {
          newStatuses[id] = { generationId: id, status: 'pending' };
        });
        setStatuses(prev => ({ ...prev, ...newStatuses }));
      }
    }
  }, [deferredCloudAuthority, videos, projectId, enabled, statuses]);

  // Process queue
  useEffect(() => {
    if (!deferredCloudAuthority || !enabled || !projectId || processingRef.current || queueRef.current.length === 0) {
      return;
    }

    const processNextVideo = async () => {
      const runGeneration = runGenerationRef.current;
      const isCurrentRun = () => (
        runGeneration === runGenerationRef.current
        && deferredCloudAuthority
        && enabled
        && Boolean(projectId)
      );
      if (!isCurrentRun()) return;
      processingRef.current = true;
      
      const generationId = queueRef.current[0];
      const video = videos.find(v => v.id === generationId);
      
      if (!video) {
        if (isCurrentRun()) queueRef.current.shift();
        processingRef.current = false;
        return;
      }

      const videoUrl = video.location || video.url;
      if (!videoUrl) {
        if (isCurrentRun()) queueRef.current.shift();
        processingRef.current = false;
        return;
      }

      // This hook is a legacy Supabase side effect. Runtime-managed galleries
      // must never reach the uploader or the generations-table update path.
      if (!isDeferredCloudDataAuthority()) {
        if (isCurrentRun()) queueRef.current.shift();
        processingRef.current = false;
        return;
      }

      // Update status to processing
      if (isCurrentRun()) {
        setStatuses(prev => ({
          ...prev,
          [generationId]: { generationId, status: 'processing' }
        }));
      }

      // Generate and upload thumbnail
      const result = await generateAndUploadThumbnail(
        videoUrl,
        generationId,
        projectId,
        isCurrentRun,
      );

      if (!isCurrentRun()) {
        processingRef.current = false;
        return;
      }

      if (result.success && result.thumbnailUrl && isDeferredCloudDataAuthority()) {

        // Update status
        setStatuses(prev => ({
          ...prev,
          [generationId]: { generationId, status: 'success' }
        }));

        // Invalidate React Query cache to refresh the UI
        // This will trigger a refetch and show the new thumbnail
        queryClient.invalidateQueries({ queryKey: unifiedGenerationQueryKeys.all });

        // Also update the cache directly for immediate UI update
        queryClient.setQueriesData(
          { queryKey: unifiedGenerationQueryKeys.all },
          (oldData: { items: Array<{ id: string; [key: string]: unknown }> } | undefined) => {
            if (!oldData?.items) return oldData;

            return {
              ...oldData,
              items: oldData.items.map((item) =>
                item.id === generationId 
                  ? { ...item, thumbUrl: result.thumbnailUrl }
                  : item
              )
            };
          }
        );
      } else {
        normalizeAndPresentError(new Error(result.error || 'Thumbnail generation failed'), { context: 'useBackgroundThumbnailGenerator', showToast: false, logData: { generationId: generationId.substring(0, 8) } });

        // Update status to error
        setStatuses(prev => ({
          ...prev,
          [generationId]: { 
            generationId, 
            status: 'error',
            error: result.error 
          }
        }));
      }

      // Remove from queue
      queueRef.current.shift();
      processingRef.current = false;

      // Wait a bit before processing next (to avoid overwhelming the system)
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        if (isCurrentRun() && queueRef.current.length > 0) {
          processNextVideo();
        }
      }, 2000); // 2 second delay between generations
    };

    processNextVideo();
  }, [deferredCloudAuthority, enabled, projectId, videos, queryClient, queueRef.current.length]);

  return {
    statuses,
    queueLength: queueRef.current.length,
    isProcessing: processingRef.current,
  };
}
