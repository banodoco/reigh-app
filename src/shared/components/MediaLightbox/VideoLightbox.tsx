/**
 * VideoLightbox
 *
 * Specialized lightbox for video media. Handles all video-specific functionality:
 * - Video trimming
 * - Video replace mode
 * - Video regenerate mode
 * - Video enhance mode
 * - Segment slot mode (timeline navigation)
 *
 * Uses useSharedLightboxState for shared functionality (variants, navigation, etc.)
 *
 * This is part of the split architecture where MediaLightbox dispatches to
 * ImageLightbox or VideoLightbox based on media type.
 */

import React from 'react';
import type { GenerationRow, Shot } from '@/types/shots';
import type { SegmentSlotModeData, AdjacentSegmentsData, ShotOption, TaskDetailsData } from './types';

import { LightboxProviders } from './components';
import { LightboxLayout } from './components/layouts/LightboxLayout';
import { SegmentSlotFormView } from './components/SegmentSlotFormView';

import {
  useVideoLightboxMode,
  useVideoLightboxEnvironment,
} from './hooks/useVideoLightboxEnvironment';
import { useVideoLightboxRenderModel } from './hooks/useVideoLightboxRenderModel';
import {
  useVideoLightboxSharedState,
  useVideoLightboxEditing,
} from './hooks/useVideoLightboxController';

import { LightboxShell } from './components';
import { VideoEditProvider } from './contexts/VideoEditContext';

export interface VideoLightboxProps {
  media?: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  segmentSlotMode?: SegmentSlotModeData;
  readOnly?: boolean;
  showNavigation?: boolean;
  showDownload?: boolean;
  hasNext?: boolean;
  hasPrevious?: boolean;
  allShots?: ShotOption[];
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: GenerationRow['metadata']) => void;
  showTickForImageId?: string | null;
  onShowTick?: (imageId: string) => void;
  showTickForSecondaryImageId?: string | null;
  onShowSecondaryTick?: (imageId: string) => void;
  starred?: boolean;
  showTaskDetails?: boolean;
  taskDetailsData?: TaskDetailsData;
  onShowTaskDetails?: () => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  onNavigateToShot?: (shot: Shot, options?: { isNewlyCreated?: boolean }) => void;
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
  positionedInSelectedShot?: boolean;
  associatedWithoutPositionInSelectedShot?: boolean;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  shotId?: string;
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
  initialVideoTrimMode?: boolean;
  initialVariantId?: string;
  fetchVariantsForSelf?: boolean;
  currentSegmentImages?: {
    startUrl?: string;
    endUrl?: string;
    startGenerationId?: string;
    endGenerationId?: string;
    startShotGenerationId?: string;
    endShotGenerationId?: string;
    activeChildGenerationId?: string;
    startVariantId?: string;
    endVariantId?: string;
  };
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  currentFrameCount?: number;
  onTrimModeChange?: (isTrimMode: boolean) => void;
  adjacentSegments?: AdjacentSegmentsData;
}

export type {
  VideoLightboxSharedStateModel,
  VideoLightboxEditModel,
} from './hooks/useVideoLightboxController';

const VideoLightboxContent: React.FC<VideoLightboxProps> = (props) => {
  const modeModel = useVideoLightboxMode(props);
  const env = useVideoLightboxEnvironment(props, modeModel);
  const sharedState = useVideoLightboxSharedState(props, modeModel, env);
  const editModel = useVideoLightboxEditing(props, modeModel, env, sharedState);
  const renderModel = useVideoLightboxRenderModel(props, modeModel, env, sharedState, editModel);

  return (
    <LightboxProviders stateValue={renderModel.lightboxStateValue}>
      <VideoEditProvider value={editModel.videoEditValue}>
        <LightboxShell
          onClose={props.onClose}
          hasCanvasOverlay={false}
          isRepositionMode={false}
          isMobile={env.isMobile}
          isTabletOrLarger={sharedState.layout.isTabletOrLarger}
          effectiveTasksPaneOpen={env.effectiveTasksPaneOpen}
          effectiveTasksPaneWidth={env.effectiveTasksPaneWidth}
          isTasksPaneLocked={env.isTasksPaneLocked}
          needsFullscreenLayout={renderModel.needsFullscreenLayout}
          needsTasksPaneOffset={renderModel.needsTasksPaneOffset}
          contentRef={env.contentRef}
          accessibilityTitle={renderModel.accessibilityTitle}
          accessibilityDescription={renderModel.accessibilityDescription}
        >
          {modeModel.isFormOnlyMode && props.segmentSlotMode ? (
            <SegmentSlotFormView
              segmentSlotMode={props.segmentSlotMode}
              onClose={props.onClose}
              onNavPrev={modeModel.handleSlotNavPrev}
              onNavNext={modeModel.handleSlotNavNext}
              hasPrevious={modeModel.hasPrevious}
              hasNext={modeModel.hasNext}
              readOnly={props.readOnly}
            />
          ) : (
            <LightboxLayout {...renderModel.layoutProps} controlsPanelContent={renderModel.controlsPanelContent} />
          )}
        </LightboxShell>
      </VideoEditProvider>
    </LightboxProviders>
  );
};

export const VideoLightbox: React.FC<VideoLightboxProps> = (props) => {
  const isSegmentSlotMode = !!props.segmentSlotMode;
  const hasSegmentVideo = isSegmentSlotMode && !!props.segmentSlotMode?.segmentVideo;
  const isFormOnlyMode = isSegmentSlotMode && !hasSegmentVideo;

  if (!props.media && !isFormOnlyMode) {
    console.error('[VideoLightbox] ❌ No media prop provided and not in form-only mode!');
    return null;
  }

  return <VideoLightboxContent {...props} />;
};
