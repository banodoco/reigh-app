/**
 * useJoinClips - Handles adding videos to the join clips queue
 *
 * Manages state and handlers for adding the current video to the pending
 * join clips list (stored in localStorage) and navigating to the join-clips tool.
 */

import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { TOOL_ROUTES } from '@/shared/lib/toolConstants';
import { GenerationRow } from '@/types/shots';

interface UseJoinClipsProps {
  media: GenerationRow;
  isVideo: boolean;
}

interface UseJoinClipsReturn {
  isAddingToJoin: boolean;
  addToJoinSuccess: boolean;
  handleAddToJoin: () => void;
  handleGoToJoin: () => void;
}

export function useJoinClips({
  media,
  isVideo,
}: UseJoinClipsProps): UseJoinClipsReturn {
  const navigate = useNavigate();

  const [isAddingToJoin, setIsAddingToJoin] = useState(false);
  const [addToJoinSuccess, setAddToJoinSuccess] = useState(false);

  const handleAddToJoin = useCallback(() => {

    if (!media || !isVideo) {
      return;
    }

    setIsAddingToJoin(true);
    try {
      // Get the video URL from the media object
      // For videos, 'location' is the primary storage field
      // 'url' is not a declared field on GenerationRow but may exist at runtime from raw DB data
      const mediaRecord = media as unknown as Record<string, unknown>;
      const videoUrl = media.location || (mediaRecord.url as string | undefined) || media.imageUrl;
      const thumbnailUrl = media.thumbUrl || media.thumbnail_url;

      if (!videoUrl) {
        console.error('[JoinClipsDebug] No video URL found on media object!', media);
        setIsAddingToJoin(false);
        return;
      }

      // Get existing pending clips or start fresh
      const existingData = localStorage.getItem('pendingJoinClips');
      const pendingClips: Array<{ videoUrl: string; thumbnailUrl?: string; generationId: string; timestamp: number }> =
        existingData ? JSON.parse(existingData) : [];

      // Add new clip (avoid duplicates by generationId)
      if (!pendingClips.some(clip => clip.generationId === media.id)) {
        const newClip = {
          videoUrl,
          thumbnailUrl: thumbnailUrl ?? undefined,
          generationId: media.id,
          timestamp: Date.now(),
        };
        pendingClips.push(newClip);
        localStorage.setItem('pendingJoinClips', JSON.stringify(pendingClips));
      }

      setAddToJoinSuccess(true);
      setTimeout(() => setAddToJoinSuccess(false), 2000);
    } catch (error) {
      handleError(error, { context: 'useJoinClips', showToast: false });
    } finally {
      setIsAddingToJoin(false);
    }
  }, [media, isVideo]);

  const handleGoToJoin = useCallback(() => {
    navigate(TOOL_ROUTES.JOIN_CLIPS);
  }, [navigate]);

  return {
    isAddingToJoin,
    addToJoinSuccess,
    handleAddToJoin,
    handleGoToJoin,
  };
}
