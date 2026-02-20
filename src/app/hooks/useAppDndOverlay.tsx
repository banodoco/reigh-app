import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragStartEvent } from '@dnd-kit/core';
import { getDisplayUrl } from '@/shared/lib/mediaUrl';

type DragData = Record<string, unknown> & {
  imageUrl?: string;
};

const PREVIEW_SIZE_PX = 200;
const DROP_ANIMATION_MS = 300;

function isVideoPreview(url: string): boolean {
  return /\.(webm|mp4|mov)$/i.test(url);
}

export function useAppDndOverlay() {
  const [activeDragData, setActiveDragData] = useState<DragData | null>(null);
  const [dropAnimation, setDropAnimation] = useState(false);
  const dropTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDropTimer = useCallback(() => {
    if (dropTimerRef.current) {
      clearTimeout(dropTimerRef.current);
      dropTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearDropTimer, [clearDropTimer]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    clearDropTimer();
    setDropAnimation(false);
    setActiveDragData((event.active.data.current as DragData) || null);
  }, [clearDropTimer]);

  const finalizeDropAnimation = useCallback(() => {
    clearDropTimer();
    setDropAnimation(true);

    dropTimerRef.current = setTimeout(() => {
      setActiveDragData(null);
      setDropAnimation(false);
      dropTimerRef.current = null;
    }, DROP_ANIMATION_MS);
  }, [clearDropTimer]);

  const handleDragCancel = useCallback(() => {
    clearDropTimer();
    setDropAnimation(false);
    setActiveDragData(null);
  }, [clearDropTimer]);

  const overlayContent = useMemo(() => {
    const rawUrl = activeDragData?.imageUrl;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return null;
    }

    const url = getDisplayUrl(rawUrl);
    const style = { maxWidth: `${PREVIEW_SIZE_PX}px`, maxHeight: `${PREVIEW_SIZE_PX}px` };

    return (
      <div className={dropAnimation ? 'animate-scale-fade' : ''} style={{ zIndex: 10000 }}>
        {isVideoPreview(url) ? (
          <video src={url} style={style} playsInline muted />
        ) : (
          <img src={url} style={style} alt="drag preview" />
        )}
      </div>
    );
  }, [activeDragData?.imageUrl, dropAnimation]);

  return {
    handleDragStart,
    handleDragCancel,
    finalizeDropAnimation,
    overlayContent,
  };
}
