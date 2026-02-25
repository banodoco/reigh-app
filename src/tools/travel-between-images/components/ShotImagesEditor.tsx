/**
 * ShotImagesEditor - Main editor for shot images in travel-between-images tool.
 *
 * Architecture:
 * - Thin orchestration component
 * - Dedicated hooks for data, mode orchestration, and action callbacks
 * - Dedicated render sections for header, content, and overlays
 */

import React, { useCallback, useRef } from 'react';
import { Card } from '@/shared/components/ui/card';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/media/aspectRatios';
import {
  useShotImagesEditorModel,
} from './ShotImagesEditor/hooks';
import { useShotImagesEditorCallbacks } from './ShotImagesEditor/hooks/useShotImagesEditorCallbacks';
import {
  EditorHeader,
  EditorContent,
  EditorOverlays,
} from './ShotImagesEditor/ShotImagesEditorSections';
import {
  resolveShotImagesEditorProps,
  type ShotImagesEditorProps,
  type ShotImagesEditorResolvedProps,
} from './ShotImagesEditor/types';

const ShotImagesEditor: React.FC<ShotImagesEditorProps> = (props) => {
  const resolvedProps: ShotImagesEditorResolvedProps = resolveShotImagesEditorProps(props);
  const {
    isMobile,
    generationMode,
    projectAspectRatio,
    settingsError,
    readOnly = false,
    onGenerationModeChange,
  } = resolvedProps;

  const effectiveGenerationMode = isMobile ? 'batch' : generationMode;
  const resolvedProjectResolution = projectAspectRatio
    ? ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio]
    : undefined;

  const trailingFrameUpdateRef = useRef<((endFrame: number) => void) | null>(null);
  const registerTrailingUpdater = useCallback((fn: (endFrame: number) => void) => {
    trailingFrameUpdateRef.current = fn;
  }, []);

  const { data, mode, timelineMediaValue } = useShotImagesEditorModel(
    resolvedProps,
    effectiveGenerationMode,
    resolvedProjectResolution,
    trailingFrameUpdateRef,
  );

  const callbacks = useShotImagesEditorCallbacks({
    selectedShotId: resolvedProps.selectedShotId,
    projectId: resolvedProps.projectId,
    preloadedImages: resolvedProps.preloadedImages,
    onImageDelete: resolvedProps.onImageDelete,
    onAddToShot: resolvedProps.onAddToShot,
    onAddToShotWithoutPosition: resolvedProps.onAddToShotWithoutPosition,
    onCreateShot: resolvedProps.onCreateShot,
    onDragStateChange: resolvedProps.onDragStateChange,
    data,
  });

  return (
    <Card className="w-full">
      <EditorHeader
        settingsError={settingsError ?? undefined}
        readOnly={readOnly}
        hasVideosToPreview={mode.preview.hasVideosToPreview}
        isDownloadingImages={mode.download.isDownloadingImages}
        hasImages={Boolean(data.imagesWithBadges?.length)}
        isMobile={isMobile}
        generationMode={generationMode}
        onGenerationModeChange={onGenerationModeChange}
        onOpenPreview={() => mode.preview.setIsPreviewTogetherOpen(true)}
        onDownloadAll={mode.download.handleDownloadAllImages}
      />

      <EditorContent
        componentProps={resolvedProps}
        data={data}
        mode={mode}
        callbacks={callbacks}
        timelineMediaValue={timelineMediaValue}
        registerTrailingUpdater={registerTrailingUpdater}
      />

      <EditorOverlays
        componentProps={resolvedProps}
        mode={mode}
      />
    </Card>
  );
};

export default React.memo(ShotImagesEditor);
