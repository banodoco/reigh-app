import React from 'react';
import { AddAudioButton } from './AddAudioButton';
import { GuidanceVideoControls } from './GuidanceVideoControls';
import { TimelineBottomControls } from './TimelineBottomControls';
import { ZoomControls } from './ZoomControls';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import type { VideoMetadata } from '@/shared/lib/media/videoUploader';

interface TimelineControlsProps {
  shotId: string;
  projectId: string | null;
  readOnly: boolean;
  hasNoImages: boolean;
  zoomLevel: number;
  fullMax: number;
  audioUrl?: string | null;
  onAudioChange?: (audioUrl: string | null, metadata: { duration: number; name?: string } | null) => void;
  primaryStructureVideoPath?: string | null;
  primaryStructureVideoType: 'uni3c' | 'flow' | 'canny' | 'depth';
  primaryStructureVideoTreatment: 'adjust' | 'clip';
  primaryStructureVideoMotionStrength: number;
  structureVideos?: StructureVideoConfigWithMetadata[];
  onAddStructureVideo?: (video: StructureVideoConfigWithMetadata) => void;
  onUpdateStructureVideo?: (index: number, updates: Partial<StructureVideoConfigWithMetadata>) => void;
  onPrimaryStructureVideoInputChange?: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string,
  ) => void;
  onShowVideoBrowser: () => void;
  isUploadingStructureVideo: boolean;
  setIsUploadingStructureVideo: (uploading: boolean) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onZoomToStart: () => void;
  resetGap: number;
  setResetGap: (value: number) => void;
  maxGap: number;
  onReset: () => void;
  onFileDrop?: (files: File[], targetFrame?: number) => Promise<void>;
  isUploadingImage: boolean;
  uploadProgress: number;
  pushMode: boolean;
  showDragHint: boolean;
}

export const TimelineControls: React.FC<TimelineControlsProps> = ({
  shotId,
  projectId,
  readOnly,
  hasNoImages,
  zoomLevel,
  fullMax,
  audioUrl,
  onAudioChange,
  primaryStructureVideoPath,
  primaryStructureVideoType,
  primaryStructureVideoTreatment,
  primaryStructureVideoMotionStrength,
  structureVideos,
  onAddStructureVideo,
  onUpdateStructureVideo,
  onPrimaryStructureVideoInputChange,
  onShowVideoBrowser,
  isUploadingStructureVideo,
  setIsUploadingStructureVideo,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onZoomToStart,
  resetGap,
  setResetGap,
  maxGap,
  onReset,
  onFileDrop,
  isUploadingImage,
  uploadProgress,
  pushMode,
  showDragHint,
}) => (
  <>
    {shotId && (projectId || readOnly) && onPrimaryStructureVideoInputChange && (primaryStructureVideoPath || !readOnly) && (
      <div
        className="absolute left-0 z-30 flex items-end justify-between pointer-events-none px-8"
        style={{ width: '100%', maxWidth: '100vw', top: zoomLevel > 1 ? '0.98875rem' : '1rem' }}
      >
        <ZoomControls
          zoomLevel={zoomLevel}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onZoomReset={onZoomReset}
          onZoomToStart={onZoomToStart}
          hasNoImages={hasNoImages}
        />

        {!audioUrl && onAudioChange && !readOnly && (
          <AddAudioButton projectId={projectId} shotId={shotId} onAudioChange={onAudioChange} />
        )}

        {(structureVideos ? true : !primaryStructureVideoPath) && (
          <GuidanceVideoControls
            shotId={shotId}
            projectId={projectId}
            readOnly={readOnly}
            hasNoImages={hasNoImages}
            primaryStructureVideoType={primaryStructureVideoType}
            primaryStructureVideoTreatment={primaryStructureVideoTreatment}
            primaryStructureVideoMotionStrength={primaryStructureVideoMotionStrength}
            structureVideos={structureVideos}
            fullMax={fullMax}
            onAddStructureVideo={onAddStructureVideo}
            onUpdateStructureVideo={onUpdateStructureVideo}
            onPrimaryStructureVideoInputChange={onPrimaryStructureVideoInputChange}
            onShowVideoBrowser={onShowVideoBrowser}
            isUploadingStructureVideo={isUploadingStructureVideo}
            setIsUploadingStructureVideo={setIsUploadingStructureVideo}
          />
        )}
      </div>
    )}

    <TimelineBottomControls
      resetGap={resetGap}
      setResetGap={setResetGap}
      maxGap={maxGap}
      onReset={onReset}
      onFileDrop={onFileDrop}
      isUploadingImage={isUploadingImage}
      uploadProgress={uploadProgress}
      readOnly={readOnly}
      hasNoImages={hasNoImages}
      zoomLevel={zoomLevel}
      pushMode={pushMode}
      showDragHint={showDragHint}
    />
  </>
);
