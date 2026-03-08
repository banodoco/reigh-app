/**
 * TimelineSection - Timeline and image editor section
 *
 * Wraps ShotImagesEditor with context-provided values.
 * Most data comes from ShotSettingsContext, only behavior/config props needed.
 */

import React from 'react';
import { ShotImagesEditor } from '../../ShotImagesEditor';
import { ImageManagerSkeleton } from '../ui/Skeleton';
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
        displayOptions={{
          isModeReady,
          settingsError,
          isMobile,
          generationMode: generationMode ?? 'timeline',
          onGenerationModeChange: onGenerationModeChange ?? (() => {}),
          columns,
          skeleton: (
            <ImageManagerSkeleton
              isMobile={isMobile}
              columns={columns}
              shotImages={contextImages}
              projectAspectRatio={effectiveAspectRatio}
            />
          ),
          readOnly: false,
          projectAspectRatio: effectiveAspectRatio,
          cachedHasStructureVideo,
          maxFrameLimit,
          smoothContinuations,
          selectedOutputId,
          onSelectedOutputChange,
        }}
        imageState={{
          selectedShotId: selectedShot.id,
          preloadedImages: allShotImages,
          projectId,
          shotName: selectedShot.name,
          batchVideoFrames,
          pendingPositions,
          unpositionedGenerationsCount: isGenerationsPaneLocked ? 0 : unpositionedImages.length,
          fileInputKey: state.fileInputKey,
          isUploadingImage: state.isUploadingImage,
          uploadProgress: state.uploadProgress,
          duplicatingImageId: state.duplicatingImageId,
          duplicateSuccessImageId: state.duplicateSuccessImageId,
          defaultPrompt,
          onDefaultPromptChange,
          defaultNegativePrompt,
          onDefaultNegativePromptChange,
          structureVideos: structureVideo.structureVideos,
          isStructureVideoLoading: structureVideo.isLoading,
          audioUrl: audio.audioUrl,
          audioMetadata: audio.audioMetadata,
        }}
        editActions={{
          onImageReorder: imageHandlers.onReorder,
          onFramePositionsChange: () => {},
          onFileDrop: imageHandlers.onFileDrop,
          onGenerationDrop: imageHandlers.onGenerationDrop,
          onBatchFileDrop: imageHandlers.onBatchFileDrop,
          onBatchGenerationDrop: imageHandlers.onBatchGenerationDrop,
          onPendingPositionApplied,
          onImageDelete: imageHandlers.onDelete,
          onBatchImageDelete: imageHandlers.onBatchDelete,
          onImageDuplicate: imageHandlers.onDuplicate,
          onOpenUnpositionedPane: shotManagement.openUnpositionedGenerationsPane,
          onImageUpload: async (files) => {
            if (imageHandlers.onBatchFileDrop) {
              await imageHandlers.onBatchFileDrop(files);
            }
          },
          onPrimaryStructureVideoInputChange: structureVideoHandlers.handleStructureVideoInputChange,
          onUni3cEndPercentChange: structureVideoHandlers.handleUni3cEndPercentChange,
          onAddStructureVideo: structureVideo.addStructureVideo,
          onUpdateStructureVideo: structureVideo.updateStructureVideo,
          onRemoveStructureVideo: structureVideo.removeStructureVideo,
          onSetStructureVideos: structureVideo.setStructureVideos,
          onAudioChange: audio.handleAudioChange,
          onSelectionChange,
          onDragStateChange,
          onTrailingDurationChange: (durationFrames) => {
            if (typeof durationFrames === 'number') {
              onBatchVideoFramesChange(durationFrames);
            }
          },
        }}
        shotWorkflow={{
          allShots: shotManagement.allShots,
          onShotChange: shotManagement.onShotChange,
          onAddToShot: shotManagement.onAddToShot,
          onAddToShotWithoutPosition: shotManagement.onAddToShotWithoutPosition,
          onCreateShot: shotManagement.onCreateShot,
          onNewShotFromSelection: shotManagement.onNewShotFromSelection,
        }}
      />
    </div>
  );
};
