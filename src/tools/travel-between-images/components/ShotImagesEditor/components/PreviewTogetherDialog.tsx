/**
 * PreviewTogetherDialog - Video preview dialog for playing all segments sequentially.
 *
 * Features:
 * - Dual video elements for seamless cuts between segments
 * - Crossfade animation for image-only segments
 * - Audio sync across segments
 * - Keyboard navigation (arrow keys)
 * - Auto-scroll thumbnail strip
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { PreviewTogetherStage } from './PreviewTogetherStage';
import { PreviewTogetherThumbnails } from './PreviewTogetherThumbnails';
import { usePreviewTogetherPlayback } from './hooks/usePreviewTogetherPlayback';
import type { PreviewSegment } from './PreviewTogetherTypes';

export type { PreviewSegment };

export interface PreviewTogetherDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  previewableSegments: PreviewSegment[];
  projectAspectRatio?: string;
  audioUrl?: string | null;
  onOpenInLightbox?: (segmentIndex: number) => void;
  /** When set, open the dialog starting at this pair index instead of 0 */
  initialPairIndex?: number | null;
}

function getPreviewAspectStyle(projectAspectRatio?: string): { aspectRatio: string } {
  if (!projectAspectRatio) {
    return { aspectRatio: '16/9' };
  }

  const [width, height] = projectAspectRatio.split(':').map(Number);
  if (width && height) {
    return { aspectRatio: `${width}/${height}` };
  }

  return { aspectRatio: '16/9' };
}

export function PreviewTogetherDialog({
  isOpen,
  onOpenChange,
  previewableSegments,
  projectAspectRatio,
  audioUrl,
  onOpenInLightbox,
  initialPairIndex,
}: PreviewTogetherDialogProps) {
  const {
    safeIndex,
    currentSegment,
    previewIsPlaying,
    previewCurrentTime,
    previewDuration,
    isPreviewVideoLoading,
    isAudioEnabled,
    crossfadeProgress,
    activeVideoSlot,
    previewVideoRef,
    previewVideoRefB,
    previewAudioRef,
    previewThumbnailsRef,
    handlePlayPause,
    handleNavigate,
    createVideoHandlers,
    handleToggleAudio,
    handleSeek,
    handleSelectSegment,
  } = usePreviewTogetherPlayback({
    isOpen,
    previewableSegments,
    audioUrl,
    initialPairIndex,
  });

  if (previewableSegments.length === 0 || !currentSegment) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Preview Segments</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No segments available to preview
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Preview Segments</DialogTitle>
        </DialogHeader>
        <div className="p-4 overflow-hidden">
          <div className="flex flex-col gap-4 overflow-hidden">
            <PreviewTogetherStage
              currentSegment={currentSegment}
              previewableSegments={previewableSegments}
              previewAspectStyle={getPreviewAspectStyle(projectAspectRatio)}
              isPreviewVideoLoading={isPreviewVideoLoading}
              activeVideoSlot={activeVideoSlot}
              previewVideoRef={previewVideoRef}
              previewVideoRefB={previewVideoRefB}
              previewAudioRef={previewAudioRef}
              audioUrl={audioUrl}
              onOpenInLightbox={onOpenInLightbox}
              crossfadeProgress={crossfadeProgress}
              previewIsPlaying={previewIsPlaying}
              previewCurrentTime={previewCurrentTime}
              previewDuration={previewDuration}
              isAudioEnabled={isAudioEnabled}
              onPlayPause={handlePlayPause}
              onNavigate={handleNavigate}
              createVideoHandlers={createVideoHandlers}
              onToggleAudio={handleToggleAudio}
              onSeek={handleSeek}
            />

            <PreviewTogetherThumbnails
              previewableSegments={previewableSegments}
              safeIndex={safeIndex}
              previewThumbnailsRef={previewThumbnailsRef}
              onSelectSegment={handleSelectSegment}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
