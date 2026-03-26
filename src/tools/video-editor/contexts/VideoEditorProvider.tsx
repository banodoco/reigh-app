import { useCallback, useMemo, useRef } from 'react';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider';
import { DataProviderWrapper } from '@/tools/video-editor/contexts/DataProviderContext';
import { TimelineChromeContextProvider } from '@/tools/video-editor/contexts/TimelineChromeContext';
import { TimelineEditorContextProvider } from '@/tools/video-editor/contexts/TimelineEditorContext';
import { TimelinePlaybackContextProvider } from '@/tools/video-editor/contexts/TimelinePlaybackContext';
import { useEffects } from '@/tools/video-editor/hooks/useEffects';
import { useEffectRegistry } from '@/tools/video-editor/hooks/useEffectRegistry';
import { useEffectResources } from '@/tools/video-editor/hooks/useEffectResources';
import { useTimelineState } from '@/tools/video-editor/hooks/useTimelineState';

function InnerProvider({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  const effectsQuery = useEffects(userId);
  const effectResources = useEffectResources(userId);
  useEffectRegistry(
    effectsQuery.data?.map((effect) => ({
      slug: effect.slug,
      code: effect.code,
    })),
    effectResources.effects,
  );
  const { editor, chrome, playback } = useTimelineState();

  // Shared lightbox callback — PreviewPanel registers its handler, timeline clips call it
  const lightboxHandlerRef = useRef<((assetKey: string) => void) | null>(null);
  const onDoubleClickAsset = useCallback((assetKey: string) => {
    lightboxHandlerRef.current?.(assetKey);
  }, []);

  const editorWithLightbox = useMemo(() => ({
    ...editor,
    onDoubleClickAsset,
    registerLightboxHandler: (handler: ((assetKey: string) => void) | null) => {
      lightboxHandlerRef.current = handler;
    },
  }), [editor, onDoubleClickAsset]);

  return (
    <TimelineEditorContextProvider value={editorWithLightbox}>
      <TimelineChromeContextProvider value={chrome}>
        <TimelinePlaybackContextProvider value={playback}>
          {children}
        </TimelinePlaybackContextProvider>
      </TimelineChromeContextProvider>
    </TimelineEditorContextProvider>
  );
}

export function VideoEditorProvider({
  dataProvider,
  timelineId,
  timelineName,
  userId,
  children,
}: {
  dataProvider: DataProvider;
  timelineId: string;
  timelineName?: string | null;
  userId: string;
  children: React.ReactNode;
}) {
  return (
    <DataProviderWrapper value={{ provider: dataProvider, timelineId, timelineName, userId }}>
      <InnerProvider userId={userId}>{children}</InnerProvider>
    </DataProviderWrapper>
  );
}
