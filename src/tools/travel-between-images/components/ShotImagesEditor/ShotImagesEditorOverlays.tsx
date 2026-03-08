import { MediaLightbox } from '@/domains/media-lightbox/MediaLightbox';
import { PreviewTogetherDialog, type PreviewSegment } from './components/PreviewTogetherDialog';
import type { ShotImagesEditorModeModel } from './hooks/useShotImagesEditorModel';
import type { ShotImagesEditorResolvedProps } from './types';

export function EditorOverlays(props: {
  componentProps: ShotImagesEditorResolvedProps;
  mode: ShotImagesEditorModeModel;
}) {
  const { componentProps, mode } = props;
  const {
    readOnly = false,
    selectedShotId,
    projectAspectRatio,
    audioUrl,
  } = componentProps;

  return (
    <>
      <div
        ref={mode.transitionOverlayRef}
        className="fixed inset-0 z-[99999] bg-black pointer-events-none"
        aria-hidden="true"
        style={mode.segmentSlot.pendingImageToOpen ? { opacity: 1, display: 'block' } : { opacity: 0, display: 'none' }}
      />

      {mode.segmentSlot.segmentSlotModeData && (
        <MediaLightbox
          media={mode.segmentSlot.segmentSlotModeData.segmentVideo || undefined}
          segmentSlotMode={mode.segmentSlot.segmentSlotModeData}
          onClose={() => mode.segmentSlot.setSegmentSlotLightboxIndex(null)}
          shotId={selectedShotId}
          readOnly={readOnly}
          videoProps={{ fetchVariantsForSelf: true }}
        />
      )}

      <PreviewTogetherDialog
        isOpen={mode.preview.isPreviewTogetherOpen}
        onOpenChange={(open) => {
          mode.preview.setIsPreviewTogetherOpen(open);
          if (!open) {
            mode.setPreviewInitialPairIndex(null);
          }
        }}
        previewableSegments={mode.preview.previewableSegments as PreviewSegment[]}
        projectAspectRatio={projectAspectRatio}
        audioUrl={audioUrl}
        initialPairIndex={mode.previewInitialPairIndex}
        onOpenInLightbox={(segmentIndex) => {
          mode.preview.setIsPreviewTogetherOpen(false);
          mode.segmentSlot.handlePairClick(segmentIndex);
        }}
      />
    </>
  );
}
