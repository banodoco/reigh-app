/**
 * Batch mode content for ShotImagesEditor.
 * Renders ShotImageManager with grid layout and BatchGuidanceVideo.
 */

import React from 'react';
import { TOOL_IDS } from '@/shared/lib/toolConstants';
import { Button } from '@/shared/components/ui/button';
import { ShotImageManagerContainer as ShotImageManager } from '@/shared/components/ShotImageManager/ShotImageManagerContainer';
import { BatchGuidanceVideo } from '../../BatchGuidanceVideo';
import { SectionHeader } from '@/shared/components/ImageGenerationForm/components';
import type { PairData } from '../../Timeline/TimelineContainer';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import type { GenerationRow, Shot } from '@/types/shots';
import type { SegmentSlot } from '@/shared/hooks/segments';

export interface BatchModeContentProps {
  // Core
  selectedShotId: string;
  projectId?: string;
  readOnly: boolean;
  isMobile: boolean;
  generationMode: 'batch' | 'timeline' | 'by-pair';

  // Images
  images: GenerationRow[];
  pairPrompts: Record<string, { prompt: string; negativePrompt: string }>;

  // Grid
  columns: 2 | 3 | 4 | 6;
  batchVideoFrames: number;

  // Image actions
  onImageReorder: (orderedIds: string[]) => void;
  onImageDelete: (id: string) => void;
  onBatchImageDelete?: (ids: string[]) => void;
  onImageDuplicate?: (id: string, timeline_frame: number) => void;
  duplicatingImageId?: string | null;
  duplicateSuccessImageId?: string | null;

  // Drop handlers
  onFileDrop?: (files: File[], targetPosition?: number) => Promise<void>;
  onGenerationDrop?: (generationId: string, imageUrl: string, thumbUrl: string | undefined, targetPosition?: number) => Promise<void>;

  // Prompts
  defaultPrompt: string;
  defaultNegativePrompt: string;
  onClearEnhancedPrompt: (pairIndex: number) => Promise<void>;

  // Callbacks
  onDragStateChange: (isDragging: boolean) => void;
  onPairClick: (pairIndex: number, pairData?: PairData) => void;
  onSelectionChange?: (hasSelection: boolean) => void;

  // Image upload
  onImageUpload: (files: File[]) => Promise<void>;
  isUploadingImage: boolean;

  // Shot management
  allShots?: Shot[];
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string) => Promise<boolean>;
  onCreateShot?: (shotName: string) => Promise<{ shotId: string; shotName: string }>;
  onNewShotFromSelection?: (selectedIds: string[]) => Promise<string | void>;

  // Segment slots
  segmentSlots: SegmentSlot[];
  onSegmentDelete: (generationId: string) => Promise<void>;
  deletingSegmentId: string | null;

  // Lightbox transitions
  pendingImageToOpen: string | null;
  pendingImageVariantId?: string | null;
  onClearPendingImageToOpen: () => void;
  navigateWithTransition: (doNavigation: () => void) => void;

  // Display
  projectAspectRatio?: string;

  // Structure video (batch mode)
  primaryStructureVideoPath?: string | null;
  primaryStructureVideoMetadata?: VideoMetadata | null;
  primaryStructureVideoTreatment: 'adjust' | 'clip';
  primaryStructureVideoMotionStrength: number;
  primaryStructureVideoType: 'uni3c' | 'flow' | 'canny' | 'depth';
  primaryStructureVideoUni3cEndPercent: number;
  onPrimaryStructureVideoInputChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string
  ) => void;
  onUni3cEndPercentChange?: (value: number) => void;

  // Unpositioned
  unpositionedGenerationsCount: number;
  onOpenUnpositionedPane: () => void;
}

export const BatchModeContent: React.FC<BatchModeContentProps> = ({
  selectedShotId,
  projectId,
  readOnly,
  isMobile,
  generationMode,
  images,
  pairPrompts,
  columns,
  batchVideoFrames,
  onImageReorder,
  onImageDelete,
  onBatchImageDelete,
  onImageDuplicate,
  duplicatingImageId,
  duplicateSuccessImageId,
  onFileDrop,
  onGenerationDrop,
  defaultPrompt,
  defaultNegativePrompt,
  onClearEnhancedPrompt,
  onDragStateChange,
  onPairClick,
  onSelectionChange,
  onImageUpload,
  isUploadingImage,
  allShots,
  onShotChange,
  onAddToShot,
  onAddToShotWithoutPosition,
  onCreateShot,
  onNewShotFromSelection,
  segmentSlots,
  onSegmentDelete,
  deletingSegmentId,
  pendingImageToOpen,
  pendingImageVariantId,
  onClearPendingImageToOpen,
  navigateWithTransition,
  projectAspectRatio,
  primaryStructureVideoPath,
  primaryStructureVideoMetadata,
  primaryStructureVideoTreatment,
  primaryStructureVideoMotionStrength,
  primaryStructureVideoType,
  primaryStructureVideoUni3cEndPercent,
  onPrimaryStructureVideoInputChange,
  onUni3cEndPercentChange,
  unpositionedGenerationsCount,
  onOpenUnpositionedPane,
}) => {
  // Build enhanced prompts from image metadata
  const enhancedPrompts = React.useMemo(() => {
    const result: Record<number, string> = {};
    images.forEach((img, index) => {
      const enhancedPrompt = img.metadata?.enhanced_prompt;
      if (enhancedPrompt) result[index] = enhancedPrompt;
    });
    return result;
  }, [images]);

  return (
    <>
      <div className="mb-4">
        <SectionHeader title="Input Images" theme="blue" />
      </div>

      <ShotImageManager
        images={images}
        onImageDelete={onImageDelete}
        onBatchImageDelete={onBatchImageDelete}
        onImageDuplicate={onImageDuplicate}
        onImageReorder={onImageReorder}
        columns={columns}
        generationMode={isMobile ? 'batch' : generationMode}
        onMagicEdit={() => {}}
        duplicatingImageId={duplicatingImageId}
        duplicateSuccessImageId={duplicateSuccessImageId}
        projectAspectRatio={projectAspectRatio}
        onImageUpload={onImageUpload}
        isUploadingImage={isUploadingImage}
        batchVideoFrames={batchVideoFrames}
        onSelectionChange={onSelectionChange}
        readOnly={readOnly}
        onFileDrop={onFileDrop}
        onGenerationDrop={onGenerationDrop}
        shotId={selectedShotId}
        projectId={projectId}
        toolTypeOverride={TOOL_IDS.TRAVEL_BETWEEN_IMAGES}
        allShots={allShots}
        selectedShotId={selectedShotId}
        onShotChange={onShotChange}
        onAddToShot={onAddToShot}
        onAddToShotWithoutPosition={onAddToShotWithoutPosition}
        onCreateShot={onCreateShot}
        onNewShotFromSelection={onNewShotFromSelection}
        onPairClick={onPairClick}
        pairPrompts={pairPrompts}
        enhancedPrompts={enhancedPrompts}
        defaultPrompt={defaultPrompt}
        defaultNegativePrompt={defaultNegativePrompt}
        onClearEnhancedPrompt={onClearEnhancedPrompt}
        onDragStateChange={onDragStateChange}
        segmentSlots={segmentSlots}
        onSegmentDelete={onSegmentDelete}
        deletingSegmentId={deletingSegmentId}
        pendingImageToOpen={pendingImageToOpen}
        pendingImageVariantId={pendingImageVariantId}
        onClearPendingImageToOpen={onClearPendingImageToOpen}
        navigateWithTransition={navigateWithTransition}
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

      {/* Batch mode structure video */}
      {selectedShotId && (projectId || readOnly) && onPrimaryStructureVideoInputChange && (primaryStructureVideoPath || !readOnly) && (
        <>
          <div className="mb-4 mt-6">
            <SectionHeader title="Camera Guidance Video" theme="green" />
          </div>
          <BatchGuidanceVideo
            shotId={selectedShotId}
            projectId={projectId}
            videoUrl={primaryStructureVideoPath}
            videoMetadata={primaryStructureVideoMetadata}
            treatment={primaryStructureVideoTreatment}
            motionStrength={primaryStructureVideoMotionStrength}
            structureType={primaryStructureVideoType}
            imageCount={images.length}
            timelineFramePositions={images.map((_, index) => index * batchVideoFrames)}
            onVideoUploaded={(videoUrl, metadata, resourceId) => {
              onPrimaryStructureVideoInputChange(
                videoUrl,
                metadata,
                primaryStructureVideoTreatment,
                primaryStructureVideoMotionStrength,
                primaryStructureVideoType,
                resourceId
              );
            }}
            onTreatmentChange={(treatment) => {
              if (primaryStructureVideoPath && primaryStructureVideoMetadata) {
                onPrimaryStructureVideoInputChange(
                  primaryStructureVideoPath,
                  primaryStructureVideoMetadata,
                  treatment,
                  primaryStructureVideoMotionStrength,
                  primaryStructureVideoType
                );
              }
            }}
            onMotionStrengthChange={(strength) => {
              if (primaryStructureVideoPath && primaryStructureVideoMetadata) {
                onPrimaryStructureVideoInputChange(
                  primaryStructureVideoPath,
                  primaryStructureVideoMetadata,
                  primaryStructureVideoTreatment,
                  strength,
                  primaryStructureVideoType
                );
              }
            }}
            onStructureTypeChange={(type) => {
              onPrimaryStructureVideoInputChange(
                primaryStructureVideoPath,
                primaryStructureVideoMetadata,
                primaryStructureVideoTreatment,
                primaryStructureVideoMotionStrength,
                type
              );
            }}
            uni3cEndPercent={primaryStructureVideoUni3cEndPercent}
            onUni3cEndPercentChange={onUni3cEndPercentChange}
            readOnly={readOnly}
            hideStructureSettings={true}
          />
        </>
      )}
    </>
  );
};
