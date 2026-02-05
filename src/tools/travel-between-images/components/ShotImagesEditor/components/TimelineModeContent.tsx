/**
 * Timeline mode content for ShotImagesEditor.
 * Renders the Timeline component with all required props.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import Timeline from '../../Timeline';
import type { PairData } from '../../Timeline/TimelineContainer';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { GenerationRow, Shot } from '@/types/shots';
import type { SegmentSlot } from '@/shared/hooks/segments';

export interface TimelineModeContentProps {
  // Core
  selectedShotId: string;
  projectId?: string;
  readOnly: boolean;

  // Images
  images: GenerationRow[];
  memoizedShotGenerations: GenerationRow[];
  preloadedImages?: GenerationRow[];

  // Frame management
  batchVideoFrames: number;
  updateTimelineFrame: (id: string, frame: number) => Promise<void>;
  pendingPositions: Map<string, number>;
  onPendingPositionApplied: (generationId: string) => void;
  maxFrameLimit: number;

  // Image actions
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  onFramePositionsChange: (newPositions: Map<string, number>) => void;
  onFileDrop: (files: File[], targetFrame?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetFrame?: number) => Promise<void>;
  onImageDelete: (id: string) => void;
  onImageDuplicate?: (id: string, timeline_frame: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;

  // Prompts
  defaultPrompt: string;
  defaultNegativePrompt: string;
  onClearEnhancedPrompt: (pairIndex: number) => Promise<void>;

  // Callbacks
  onTimelineChange: () => Promise<void>;
  onDragStateChange: (isDragging: boolean) => void;
  onPairClick: (pairIndex: number, pairData?: PairData) => void;

  // Structure video
  structureVideoPath?: string | null;
  structureVideoMetadata?: VideoMetadata | null;
  structureVideoTreatment: 'adjust' | 'clip';
  structureVideoMotionStrength: number;
  structureVideoType: 'uni3c' | 'flow' | 'canny' | 'depth';
  uni3cEndPercent: number;
  onStructureVideoChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
  onUni3cEndPercentChange?: (value: number) => void;
  structureVideos?: StructureVideoConfigWithMetadata[];
  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onRemoveStructureVideo?: (index: number) => void;

  // Audio
  audioUrl?: string | null;
  audioMetadata?: { duration: number; name?: string } | null;
  onAudioChange?: (audioUrl: string | null, metadata: { duration: number; name?: string } | null) => void;

  // Image upload
  onImageUpload: (files: File[]) => Promise<void>;
  isUploadingImage: boolean;
  uploadProgress: number;

  // Shot management
  allShots?: Shot[];
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string) => Promise<boolean>;
  onCreateShot?: (shotName: string) => Promise<{ shotId: string; shotName: string }>;
  onNewShotFromSelection?: (selectedIds: string[]) => Promise<string | void>;

  // Segment slots
  segmentSlots: SegmentSlot[];
  selectedOutputId?: string | null;
  onSelectedOutputChange?: (id: string | null) => void;
  onSegmentFrameCountChange: (pairShotGenerationId: string, newFrameCount: number) => Promise<{ finalFrameCount: number } | void>;

  // Lightbox transitions
  pendingImageToOpen: string | null;
  onClearPendingImageToOpen: () => void;
  navigateWithTransition: (doNavigation: () => void) => void;

  // Display
  projectAspectRatio?: string;

  // Unpositioned
  unpositionedGenerationsCount: number;
  onOpenUnpositionedPane: () => void;

  // Position system: register trailing end frame updater from TimelineContainer
  onRegisterTrailingUpdater?: (fn: (endFrame: number) => void) => void;
}

export const TimelineModeContent: React.FC<TimelineModeContentProps> = ({
  selectedShotId,
  projectId,
  readOnly,
  images,
  memoizedShotGenerations,
  preloadedImages,
  batchVideoFrames,
  updateTimelineFrame,
  pendingPositions,
  onPendingPositionApplied,
  maxFrameLimit,
  onImageReorder,
  onFramePositionsChange,
  onFileDrop,
  onGenerationDrop,
  onImageDelete,
  onImageDuplicate,
  duplicatingImageId,
  duplicateSuccessImageId,
  defaultPrompt,
  defaultNegativePrompt,
  onClearEnhancedPrompt,
  onTimelineChange,
  onDragStateChange,
  onPairClick,
  structureVideoPath,
  structureVideoMetadata,
  structureVideoTreatment,
  structureVideoMotionStrength,
  structureVideoType,
  uni3cEndPercent,
  onStructureVideoChange,
  onUni3cEndPercentChange,
  structureVideos,
  onAddStructureVideo,
  onUpdateStructureVideo,
  onRemoveStructureVideo,
  audioUrl,
  audioMetadata,
  onAudioChange,
  onImageUpload,
  isUploadingImage,
  uploadProgress,
  allShots,
  onShotChange,
  onAddToShot,
  onAddToShotWithoutPosition,
  onCreateShot,
  onNewShotFromSelection,
  segmentSlots,
  selectedOutputId,
  onSelectedOutputChange,
  onSegmentFrameCountChange,
  pendingImageToOpen,
  onClearPendingImageToOpen,
  navigateWithTransition,
  projectAspectRatio,
  unpositionedGenerationsCount,
  onOpenUnpositionedPane,
  onRegisterTrailingUpdater,
}) => {
  return (
    <>
      <Timeline
        key={`timeline-${selectedShotId}`}
        shotId={selectedShotId}
        projectId={projectId}
        frameSpacing={batchVideoFrames}
        onImageReorder={onImageReorder}
        onFramePositionsChange={onFramePositionsChange}
        onFileDrop={onFileDrop}
        onGenerationDrop={onGenerationDrop}
        pendingPositions={pendingPositions}
        onPendingPositionApplied={onPendingPositionApplied}
        onImageDelete={onImageDelete}
        onImageDuplicate={onImageDuplicate}
        duplicatingImageId={duplicatingImageId}
        duplicateSuccessImageId={duplicateSuccessImageId}
        projectAspectRatio={projectAspectRatio}
        readOnly={readOnly}
        shotGenerations={preloadedImages ? undefined : memoizedShotGenerations}
        updateTimelineFrame={updateTimelineFrame}
        allGenerations={preloadedImages}
        images={images}
        onTimelineChange={onTimelineChange}
        onDragStateChange={onDragStateChange}
        onPairClick={onPairClick}
        defaultPrompt={defaultPrompt}
        defaultNegativePrompt={defaultNegativePrompt}
        onClearEnhancedPrompt={onClearEnhancedPrompt}
        structureVideoPath={structureVideoPath}
        structureVideoMetadata={structureVideoMetadata}
        structureVideoTreatment={structureVideoTreatment}
        structureVideoMotionStrength={structureVideoMotionStrength}
        structureVideoType={structureVideoType}
        onStructureVideoChange={onStructureVideoChange}
        uni3cEndPercent={uni3cEndPercent}
        onUni3cEndPercentChange={onUni3cEndPercentChange}
        structureVideos={structureVideos}
        onAddStructureVideo={onAddStructureVideo}
        onUpdateStructureVideo={onUpdateStructureVideo}
        onRemoveStructureVideo={onRemoveStructureVideo}
        audioUrl={audioUrl}
        audioMetadata={audioMetadata}
        onAudioChange={onAudioChange}
        onImageUpload={onImageUpload}
        isUploadingImage={isUploadingImage}
        uploadProgress={uploadProgress}
        allShots={allShots}
        selectedShotId={selectedShotId}
        onShotChange={onShotChange}
        onAddToShot={onAddToShot}
        onAddToShotWithoutPosition={onAddToShotWithoutPosition}
        onCreateShot={onCreateShot}
        maxFrameLimit={maxFrameLimit}
        selectedOutputId={selectedOutputId}
        onSelectedOutputChange={onSelectedOutputChange}
        onSegmentFrameCountChange={onSegmentFrameCountChange}
        segmentSlots={segmentSlots}
        onOpenSegmentSlot={(pairIndex) => onPairClick(pairIndex)}
        pendingImageToOpen={pendingImageToOpen}
        onClearPendingImageToOpen={onClearPendingImageToOpen}
        navigateWithTransition={navigateWithTransition}
        onNewShotFromSelection={onNewShotFromSelection}
        onRegisterTrailingUpdater={onRegisterTrailingUpdater}
      />

      {/* Unpositioned generations helper */}
      {unpositionedGenerationsCount > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-dashed">
            <div className="text-sm text-muted-foreground">
              {unpositionedGenerationsCount} unpositioned generation{unpositionedGenerationsCount !== 1 ? 's' : ''}
            </div>
            <Button variant="outline" size="sm" onClick={onOpenUnpositionedPane} className="text-xs">
              View & Position
            </Button>
          </div>
        </div>
      )}
    </>
  );
};
