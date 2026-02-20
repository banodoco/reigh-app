/**
 * ShotImagesEditor - Main editor for shot images in travel-between-images tool.
 *
 * Architecture:
 * - Thin orchestration component
 * - Dedicated hooks for data, mode orchestration, and action callbacks
 * - Dedicated render sections for header, content, and overlays
 */

import React, { useCallback, useRef, useState } from 'react';
import { Card } from '@/shared/components/ui/card';
import { ASPECT_RATIO_TO_RESOLUTION } from '@/shared/lib/aspectRatios';
import {
  useShotImagesEditorModel,
} from './ShotImagesEditor/hooks';
import { useShotImagesEditorCallbacks } from './ShotImagesEditor/hooks/useShotImagesEditorCallbacks';
import {
  EditorHeader,
  EditorContent,
  EditorOverlays,
} from './ShotImagesEditor/ShotImagesEditorSections';
import type { ShotImagesEditorProps } from './ShotImagesEditor/types';

const ShotImagesEditor: React.FC<ShotImagesEditorProps> = (props) => {
  const {
    isMobile,
    generationMode,
    projectAspectRatio,
    settingsError,
    readOnly = false,
    onGenerationModeChange,
  } = props;

  const effectiveGenerationMode = isMobile ? 'batch' : generationMode;
  const resolvedProjectResolution = projectAspectRatio
    ? ASPECT_RATIO_TO_RESOLUTION[projectAspectRatio]
    : undefined;

  const trailingFrameUpdateRef = useRef<((endFrame: number) => void) | null>(null);
  const registerTrailingUpdater = useCallback((fn: (endFrame: number) => void) => {
    trailingFrameUpdateRef.current = fn;
  }, []);

  // Track local image order from Timeline so segment slots update immediately on reorder.
  const [localShotGenPositions, setLocalShotGenPositions] = useState<Map<string, number> | undefined>(undefined);
  const handleLocalPositionsChange = useCallback((positions: Map<string, number>) => {
    setLocalShotGenPositions(positions);
  }, []);

  const { data, mode, timelineMediaValue } = useShotImagesEditorModel(
    props,
    effectiveGenerationMode,
    resolvedProjectResolution,
    trailingFrameUpdateRef,
    localShotGenPositions,
  );

  const callbacks = useShotImagesEditorCallbacks({
    selectedShotId: props.selectedShotId,
    preloadedImages: props.preloadedImages,
    onImageDelete: props.onImageDelete,
    onAddToShot: props.onAddToShot,
    onAddToShotWithoutPosition: props.onAddToShotWithoutPosition,
    onCreateShot: props.onCreateShot,
    onDragStateChange: props.onDragStateChange,
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
        componentProps={props}
        data={data}
        mode={mode}
        callbacks={callbacks}
        timelineMediaValue={timelineMediaValue}
        registerTrailingUpdater={registerTrailingUpdater}
        onLocalPositionsChange={handleLocalPositionsChange}
      />

      <EditorOverlays
        componentProps={props}
        mode={mode}
      />
    </Card>
  );
};

export default React.memo(ShotImagesEditor);
