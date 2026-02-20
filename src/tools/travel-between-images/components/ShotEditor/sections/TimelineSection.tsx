/**
 * TimelineSection - Timeline and image editor section
 *
 * Wraps ShotImagesEditor with context-provided values.
 * Most data comes from ShotSettingsContext, only behavior/config props needed.
 */

import React from 'react';
import ShotImagesEditor from '../../ShotImagesEditor';
import { ImageManagerSkeleton } from '../ui';
import {
  useShotCore,
  useShotUI,
  useShotImages,
  useShotStructureVideo,
  useStructureVideoHandlers,
  useShotAudio,
  useShotImageHandlers,
  useShotManagement,
} from '../ShotSettingsContext';
import { usePanes } from '@/shared/contexts/PanesContext';

interface TimelineSectionProps {
  // Ref
  timelineSectionRef?: (node: HTMLDivElement | null) => void;

  // Mode state (controlled by parent)
  isModeReady: boolean;
  settingsError: string | null;
  isMobile: boolean;
  generationMode?: 'batch' | 'timeline' | 'by-pair';
  onGenerationModeChange?: (mode: 'batch' | 'timeline' | 'by-pair') => void;

  // Frame settings (from VideoTravelSettingsProvider)
  batchVideoFrames: number;
  onBatchVideoFramesChange: (frames: number) => void;

  // Layout
  columns: 2 | 3 | 4 | 6;

  // Pending positions (specialized state)
  pendingPositions: Map<string, number>;
  onPendingPositionApplied: (generationId: string) => void;

  // Selection callback
  onSelectionChange?: (hasSelection: boolean) => void;

  // Prompts (from VideoTravelSettingsProvider)
  defaultPrompt?: string;
  onDefaultPromptChange?: (prompt: string) => void;
  defaultNegativePrompt?: string;
  onDefaultNegativePromptChange?: (prompt: string) => void;

  // Frame constraints (from settings)
  maxFrameLimit?: number;
  smoothContinuations?: boolean;

  // Output selection (controlled by parent)
  selectedOutputId?: string | null;
  onSelectedOutputChange?: (id: string | null) => void;

  // Drag state callback
  onDragStateChange?: (isDragging: boolean) => void;

  // Project-level cache: whether this shot has structure videos (for skeleton)
  cachedHasStructureVideo?: boolean;
}

export const TimelineSection: React.FC<TimelineSectionProps> = ({
  timelineSectionRef,
  isModeReady,
  settingsError,
  isMobile,
  generationMode,
  onGenerationModeChange,
  batchVideoFrames,
  onBatchVideoFramesChange,
  columns,
  pendingPositions,
  onPendingPositionApplied,
  onSelectionChange,
  defaultPrompt,
  onDefaultPromptChange,
  defaultNegativePrompt,
  onDefaultNegativePromptChange,
  maxFrameLimit,
  smoothContinuations,
  selectedOutputId,
  onSelectedOutputChange,
  onDragStateChange,
  cachedHasStructureVideo,
}) => {
  // Get data from context
  const { selectedShot, projectId, effectiveAspectRatio } = useShotCore();
  const { state } = useShotUI();
  const { allShotImages, unpositionedImages, contextImages } = useShotImages();
  const structureVideo = useShotStructureVideo();
  const structureVideoHandlers = useStructureVideoHandlers();
  const audio = useShotAudio();
  const imageHandlers = useShotImageHandlers();
  const shotManagement = useShotManagement();
  const { isGenerationsPaneLocked } = usePanes();

  return (
    <div ref={timelineSectionRef} className="flex flex-col w-full gap-4">
      <ShotImagesEditor
        isModeReady={isModeReady}
        settingsError={settingsError}
        isMobile={isMobile}
        generationMode={generationMode ?? 'timeline'}
        onGenerationModeChange={onGenerationModeChange ?? (() => {})}
        selectedShotId={selectedShot.id}
        projectId={projectId}
        shotName={selectedShot.name}
        batchVideoFrames={batchVideoFrames}
        preloadedImages={allShotImages}
        // Image handlers from context
        onImageReorder={imageHandlers.onReorder}
        onFramePositionsChange={() => {}}
        onFileDrop={imageHandlers.onFileDrop}
        onGenerationDrop={imageHandlers.onGenerationDrop}
        onBatchFileDrop={imageHandlers.onBatchFileDrop}
        onBatchGenerationDrop={imageHandlers.onBatchGenerationDrop}
        pendingPositions={pendingPositions}
        onPendingPositionApplied={onPendingPositionApplied}
        onImageDelete={imageHandlers.onDelete}
        onBatchImageDelete={imageHandlers.onBatchDelete}
        onImageDuplicate={imageHandlers.onDuplicate}
        columns={columns}
        skeleton={
          <ImageManagerSkeleton
            isMobile={isMobile}
            columns={columns}
            shotImages={contextImages}
            projectAspectRatio={effectiveAspectRatio}
          />
        }
        // Unpositioned images from context
        unpositionedGenerationsCount={isGenerationsPaneLocked ? 0 : unpositionedImages.length}
        onOpenUnpositionedPane={shotManagement.openUnpositionedGenerationsPane}
        // UI state from context
        fileInputKey={state.fileInputKey}
        onImageUpload={async (files) => {
          if (imageHandlers.onBatchFileDrop) {
            await imageHandlers.onBatchFileDrop(files);
          }
        }}
        isUploadingImage={state.isUploadingImage}
        uploadProgress={state.uploadProgress}
        duplicatingImageId={state.duplicatingImageId}
        duplicateSuccessImageId={state.duplicateSuccessImageId}
        projectAspectRatio={effectiveAspectRatio}
        onSelectionChange={onSelectionChange}
        defaultPrompt={defaultPrompt}
        onDefaultPromptChange={onDefaultPromptChange}
        defaultNegativePrompt={defaultNegativePrompt}
        onDefaultNegativePromptChange={onDefaultNegativePromptChange}
        // Structure video from context
        primaryStructureVideoPath={structureVideo.structureVideoPath}
        primaryStructureVideoMetadata={structureVideo.structureVideoMetadata}
        primaryStructureVideoTreatment={structureVideo.structureVideoTreatment}
        primaryStructureVideoMotionStrength={structureVideo.structureVideoMotionStrength}
        primaryStructureVideoType={structureVideo.structureVideoType}
        onPrimaryStructureVideoInputChange={structureVideoHandlers.handleStructureVideoInputChange}
        primaryStructureVideoUni3cEndPercent={structureVideo.structureVideoUni3cEndPercent}
        onUni3cEndPercentChange={structureVideoHandlers.handleUni3cEndPercentChange}
        structureVideos={structureVideo.structureVideos}
        isStructureVideoLoading={structureVideo.isLoading}
        cachedHasStructureVideo={cachedHasStructureVideo}
        onAddStructureVideo={structureVideo.addStructureVideo}
        onUpdateStructureVideo={structureVideo.updateStructureVideo}
        onRemoveStructureVideo={structureVideo.removeStructureVideo}
        onSetStructureVideos={structureVideo.setStructureVideos}
        // Audio from context
        audioUrl={audio.audioUrl}
        audioMetadata={audio.audioMetadata}
        onAudioChange={audio.handleAudioChange}
        // Shot management from context
        allShots={shotManagement.allShots}
        onShotChange={shotManagement.onShotChange}
        onAddToShot={shotManagement.onAddToShot}
        onAddToShotWithoutPosition={shotManagement.onAddToShotWithoutPosition}
        onCreateShot={shotManagement.onCreateShot}
        onNewShotFromSelection={shotManagement.onNewShotFromSelection}
        onDragStateChange={onDragStateChange}
        onTrailingDurationChange={(durationFrames) => {
          if (typeof durationFrames === 'number') {
            onBatchVideoFramesChange(durationFrames);
          }
        }}
        maxFrameLimit={maxFrameLimit}
        smoothContinuations={smoothContinuations}
        selectedOutputId={selectedOutputId}
        onSelectedOutputChange={onSelectedOutputChange}
      />
    </div>
  );
};
