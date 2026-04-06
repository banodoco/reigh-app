import { useMemo } from 'react';
import { useTimelineEditorData } from '@/tools/video-editor/contexts/TimelineEditorContext';

export type SelectedMediaClip = {
  clipId: string;
  assetKey: string;
  url: string;
  mediaType: 'image' | 'video';
  generationId?: string;
};

function formatAttachmentCount(count: number, mediaType: 'image' | 'video') {
  if (count === 1) {
    return `1 ${mediaType}`;
  }

  return `${count} ${mediaType}s`;
}

export function buildSummary(imageCount: number, videoCount: number) {
  const parts = [
    imageCount > 0 ? formatAttachmentCount(imageCount, 'image') : null,
    videoCount > 0 ? formatAttachmentCount(videoCount, 'video') : null,
  ].filter((part): part is string => part !== null);

  return parts.length > 0 ? `attaching ${parts.join(', ')}` : '';
}

export function useSelectedMediaClips(): { clips: SelectedMediaClip[]; summary: string } {
  const { selectedClipIds, resolvedConfig } = useTimelineEditorData();

  return useMemo(() => {
    if (!resolvedConfig || selectedClipIds.size === 0) {
      return { clips: [], summary: '' };
    }

    const clips = [...selectedClipIds].flatMap((clipId) => {
      const clip = resolvedConfig.clips.find((item) => item.id === clipId);
      const assetKey = clip?.asset;
      const assetEntry = assetKey ? resolvedConfig.registry[assetKey] : undefined;

      if (!assetKey || !assetEntry?.src || !assetEntry.type) {
        return [];
      }

      if (assetEntry.type.startsWith('image/')) {
        return [{
          clipId,
          assetKey,
          url: assetEntry.src,
          mediaType: 'image' as const,
          generationId: assetEntry.generationId,
        }];
      }

      if (assetEntry.type.startsWith('video/')) {
        return [{
          clipId,
          assetKey,
          url: assetEntry.src,
          mediaType: 'video' as const,
          generationId: assetEntry.generationId,
        }];
      }

      return [];
    });

    const imageCount = clips.filter((clip) => clip.mediaType === 'image').length;
    const videoCount = clips.length - imageCount;

    return {
      clips,
      summary: buildSummary(imageCount, videoCount),
    };
  }, [resolvedConfig, selectedClipIds]);
}
