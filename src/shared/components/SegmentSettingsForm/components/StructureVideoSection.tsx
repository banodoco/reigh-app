/**
 * StructureVideoSection Component
 *
 * Handles the structure video area within Advanced Settings:
 * - Loading state when uploading
 * - Add structure video (upload/browse) when none exists
 * - Video preview with remove/replace when one exists
 * - Treatment selector and strength/end-percent sliders
 *
 * Only renders in timeline mode or when a structure video exists.
 */

import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { Slider } from '@/shared/components/ui/slider';
import { Loader2, Video, X, Images } from 'lucide-react';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { ResourceBrowserModalBase } from '@/features/resources/components/ResourceBrowserModalBase';
import { FieldDefaultControls } from './FieldDefaultControls';
import { StructureVideoPreview } from './StructureVideoPreview';
import { VideoPreviewSkeleton } from './VideoPreviewSkeleton';
import { TravelGuidanceEditor } from '@/shared/components/travel/TravelGuidanceEditor';
import type { useStructureVideoUpload } from '../hooks/useStructureVideoUpload';
import type {
  SegmentFieldSectionProps,
  SegmentTimelineStructureVideoProps,
  StructureVideoDragHandlers,
} from '../types';
import type { TravelGuidanceMode } from '@/shared/lib/tasks/travelGuidance';
import { coerceSelectedModel } from '@/tools/travel-between-images/settings';

interface StructureVideoSectionProps
  extends SegmentFieldSectionProps,
    SegmentTimelineStructureVideoProps,
    StructureVideoDragHandlers {
  // Structure video context
  structureVideoType?: TravelGuidanceMode | null;
  structureVideoUrl?: string;
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
    videoOutputStart?: number;
    videoOutputEnd?: number;
  };
  structureVideoDefaults?: {
    mode?: TravelGuidanceMode;
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
    cannyIntensity?: number;
    depthContrast?: number;
  };

  // Video upload hook return
  videoUpload: ReturnType<typeof useStructureVideoUpload>;
}

export const StructureVideoSection: React.FC<StructureVideoSectionProps> = ({
  structureVideoType,
  structureVideoUrl,
  structureVideoFrameRange,
  structureVideoDefaults,
  settings,
  onChange,
  shotDefaults,
  hasOverride,
  isTimelineMode,
  onAddSegmentStructureVideo,
  onRemoveSegmentStructureVideo,
  videoUpload,
  isDraggingVideo,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onSaveFieldAsDefault,
  handleSaveFieldAsDefault,
  savingField,
}) => {
  const effectiveSelectedModel = coerceSelectedModel(
    settings.selectedModel ?? shotDefaults?.selectedModel,
  );
  const effectiveGuidanceScale = settings.guidanceScale ?? shotDefaults?.guidanceScale ?? 1;

  const fieldControls = {
    selectedModel: (
      <FieldDefaultControls
        isUsingDefault={settings.selectedModel === undefined}
        onUseDefault={() => onChange({ selectedModel: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'selectedModel',
          effectiveSelectedModel,
        ) : undefined}
        isSaving={savingField === 'selectedModel'}
      />
    ),
    guidanceScale: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceScale === undefined}
        onUseDefault={() => onChange({ guidanceScale: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceScale',
          effectiveGuidanceScale,
        ) : undefined}
        isSaving={savingField === 'guidanceScale'}
      />
    ),
    guidanceMode: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceMode === undefined}
        onUseDefault={() => onChange({ guidanceMode: undefined })}
        onSetAsDefault={onSaveFieldAsDefault && structureVideoType ? () => handleSaveFieldAsDefault(
          'guidanceMode',
          settings.guidanceMode ?? structureVideoDefaults?.mode ?? structureVideoType,
        ) : undefined}
        isSaving={savingField === 'guidanceMode'}
      />
    ),
    guidanceTreatment: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceTreatment === undefined}
        onUseDefault={() => onChange({ guidanceTreatment: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceTreatment',
          settings.guidanceTreatment ?? structureVideoDefaults?.treatment ?? 'adjust',
        ) : undefined}
        isSaving={savingField === 'guidanceTreatment'}
      />
    ),
    guidanceStrength: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceStrength === undefined}
        onUseDefault={() => onChange({ guidanceStrength: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceStrength',
          settings.guidanceStrength ?? structureVideoDefaults?.motionStrength ?? 1.2,
        ) : undefined}
        isSaving={savingField === 'guidanceStrength'}
      />
    ),
    guidanceUni3cEndPercent: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceUni3cEndPercent === undefined}
        onUseDefault={() => onChange({ guidanceUni3cEndPercent: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceUni3cEndPercent',
          settings.guidanceUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1,
        ) : undefined}
        isSaving={savingField === 'guidanceUni3cEndPercent'}
      />
    ),
    guidanceCannyIntensity: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceCannyIntensity === undefined}
        onUseDefault={() => onChange({ guidanceCannyIntensity: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceCannyIntensity',
          settings.guidanceCannyIntensity ?? structureVideoDefaults?.cannyIntensity ?? 1,
        ) : undefined}
        isSaving={savingField === 'guidanceCannyIntensity'}
      />
    ),
    guidanceDepthContrast: (
      <FieldDefaultControls
        isUsingDefault={settings.guidanceDepthContrast === undefined}
        onUseDefault={() => onChange({ guidanceDepthContrast: undefined })}
        onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
          'guidanceDepthContrast',
          settings.guidanceDepthContrast ?? structureVideoDefaults?.depthContrast ?? 1,
        ) : undefined}
        isSaving={savingField === 'guidanceDepthContrast'}
      />
    ),
  } as const;

  return (
    <>
      {/* Timeline Mode: Loading state when uploading or waiting for props (no existing video) */}
      {isTimelineMode && videoUpload.isVideoLoading && !structureVideoType && (
        <div className="space-y-3 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Video className="w-3.5 h-3.5" />
            <span>Structure Video</span>
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
          </div>
          <VideoPreviewSkeleton message="Loading video..." />
        </div>
      )}

      {/* Timeline Mode: Add Structure Video (when no video exists and not loading) */}
      {isTimelineMode && !structureVideoType && !videoUpload.isVideoLoading && onAddSegmentStructureVideo && (
        <div
          className="relative space-y-3 pt-3 border-t border-border/50"
          onDragOver={onDragOver}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {/* Drop overlay - extends slightly beyond form edges */}
          {isDraggingVideo && (
            <div
              className="absolute z-20 flex items-center justify-center bg-primary/10 rounded-lg ring-2 ring-primary ring-dashed"
              style={{
                top: '-4px',
                bottom: '-4px',
                left: '-8px',
                right: '-8px',
              }}
            >
              <div className="flex items-center gap-2 text-sm text-primary font-medium">
                <Video className="w-4 h-4" />
                Drop video here
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Video className="w-3.5 h-3.5" />
            <span>Structure Video</span>
          </div>
          <div className="space-y-2">
            <input
              ref={videoUpload.addFileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={videoUpload.handleFileSelect}
              disabled={videoUpload.isUploadingVideo}
              className="hidden"
              id="segment-structure-video-upload"
            />
            <div className="flex gap-2">
              <Label htmlFor="segment-structure-video-upload" className="m-0 cursor-pointer flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={videoUpload.isUploadingVideo}
                  className="w-full"
                  asChild
                >
                  <span>
                    {videoUpload.isUploadingVideo ? (
                      <>
                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                        {Math.round(videoUpload.uploadProgress)}%
                      </>
                    ) : (
                      <>
                        <Video className="w-3 h-3 mr-2" />
                        Upload
                      </>
                    )}
                  </span>
                </Button>
              </Label>
              <Button
                variant="outline"
                size="sm"
                disabled={videoUpload.isUploadingVideo}
                onClick={() => videoUpload.setShowVideoBrowser(true)}
                className="flex-1"
              >
                <Images className="w-3 h-3 mr-2" />
                Browse
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Drop a video here or click to upload
            </p>
          </div>
        </div>
      )}

      <div
        className="space-y-3 pt-3 border-t border-border/50"
        onDragOver={structureVideoType && isTimelineMode ? onDragOver : undefined}
        onDragEnter={structureVideoType && isTimelineMode ? onDragEnter : undefined}
        onDragLeave={structureVideoType && isTimelineMode ? onDragLeave : undefined}
        onDrop={structureVideoType && isTimelineMode ? onDrop : undefined}
      >
        {/* Structure Video Overrides - shown when segment has structure video */}
        {structureVideoType ? (
          <>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Video className="w-3.5 h-3.5" />
              <span>Structure Video {isTimelineMode ? '' : 'Overrides'}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80">
                {structureVideoType === 'uni3c'
                  ? 'Uni3C'
                  : structureVideoType === 'flow'
                    ? 'Optical Flow'
                    : structureVideoType === 'raw'
                      ? 'Raw Video'
                      : structureVideoType === 'video'
                        ? 'Video Guide'
                        : structureVideoType === 'pose'
                          ? 'Pose'
                          : structureVideoType === 'canny'
                            ? 'Canny'
                            : structureVideoType === 'depth'
                              ? 'Depth'
                              : structureVideoType}
              </span>
            </div>

            {/* 3-Frame Preview with Remove button overlay */}
            {structureVideoUrl && structureVideoFrameRange ? (
              <div className="relative">
                {/* Drop overlay when dragging - extends slightly beyond preview */}
                {isDraggingVideo && isTimelineMode && (
                  <div
                    className="absolute z-20 flex items-center justify-center bg-primary/20 rounded-lg border-2 border-dashed border-primary"
                    style={{
                      top: '-4px',
                      bottom: '-4px',
                      left: '-8px',
                      right: '-8px',
                    }}
                  >
                    <div className="flex items-center gap-2 text-sm text-primary font-medium">
                      <Video className="w-4 h-4" />
                      Drop to replace
                    </div>
                  </div>
                )}
                {/* Remove button - show even while preview is loading, just not during upload */}
                {isTimelineMode && onRemoveSegmentStructureVideo && !videoUpload.isUploadingVideo && !isDraggingVideo && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      videoUpload.clearPendingVideo();
                      onRemoveSegmentStructureVideo();
                    }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      videoUpload.clearPendingVideo();
                      onRemoveSegmentStructureVideo();
                    }}
                    disabled={videoUpload.isUploadingVideo}
                    className="absolute -top-1 -right-1 z-10 h-6 w-6 p-0 rounded-full bg-background/80 hover:bg-destructive/20 text-destructive hover:text-destructive"
                    title="Remove video"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
                {/* Show skeleton when waiting for new video props to arrive */}
                {videoUpload.pendingVideoUrl && videoUpload.pendingVideoUrl !== structureVideoUrl && !videoUpload.isUploadingVideo ? (
                  <VideoPreviewSkeleton message="Loading new video..." />
                ) : (
                  <StructureVideoPreview
                    videoUrl={structureVideoUrl}
                    frameRange={structureVideoFrameRange}
                    treatment={settings.guidanceTreatment ?? structureVideoDefaults?.treatment ?? 'adjust'}
                    onLoadComplete={videoUpload.handleVideoPreviewLoaded}
                  />
                )}
              </div>
            ) : null}
            {/* Skeleton when no preview URL yet but loading */}
            {videoUpload.isVideoLoading && !structureVideoUrl && structureVideoFrameRange ? (
              <VideoPreviewSkeleton message="Loading video..." />
            ) : null}

            {/* Treatment Mode Selector with Upload/Browse - Timeline Mode Only */}
            {isTimelineMode ? (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  {/* Upload/Browse buttons */}
                  {onAddSegmentStructureVideo && (
                    <div className="flex-1 @container">
                      <Label className="text-xs font-medium">Replace:</Label>
                      <div className="flex gap-1 mt-1">
                        <input
                          ref={videoUpload.fileInputRef}
                          type="file"
                          accept="video/mp4,video/webm,video/quicktime"
                          onChange={videoUpload.handleFileSelect}
                          disabled={videoUpload.isUploadingVideo}
                          className="hidden"
                          id="segment-structure-video-replace"
                        />
                        <Label htmlFor="segment-structure-video-replace" className="m-0 cursor-pointer flex-1">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={videoUpload.isUploadingVideo}
                            className="w-full h-8"
                            asChild
                          >
                            <span>
                              {videoUpload.isUploadingVideo ? (
                                <>
                                  <Loader2 className="w-3 h-3 @[120px]:mr-1 animate-spin" />
                                  <span className="hidden @[120px]:inline">{Math.round(videoUpload.uploadProgress)}%</span>
                                </>
                              ) : (
                                <>
                                  <Video className="w-3 h-3 @[120px]:mr-1" />
                                  <span className="hidden @[120px]:inline">Upload</span>
                                </>
                              )}
                            </span>
                          </Button>
                        </Label>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={videoUpload.isUploadingVideo}
                          onClick={() => videoUpload.setShowVideoBrowser(true)}
                          className="flex-1 h-8"
                        >
                          <Images className="w-3 h-3 @[120px]:mr-1" />
                          <span className="hidden @[120px]:inline">Browse</span>
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <TravelGuidanceEditor
          selectedModel={effectiveSelectedModel}
          onSelectedModelChange={(value) => onChange({ selectedModel: value })}
          hasStructureVideo={!!structureVideoUrl}
          guidanceMode={settings.guidanceMode ?? structureVideoDefaults?.mode ?? structureVideoType ?? null}
          onGuidanceModeChange={(value) => onChange({ guidanceMode: value })}
          guidanceScale={effectiveGuidanceScale}
          onGuidanceScaleChange={(value) => onChange({ guidanceScale: value })}
          guidanceTreatment={settings.guidanceTreatment ?? structureVideoDefaults?.treatment ?? 'adjust'}
          onGuidanceTreatmentChange={(value) => onChange({ guidanceTreatment: value })}
          guidanceStrength={settings.guidanceStrength ?? structureVideoDefaults?.motionStrength ?? 1.2}
          onGuidanceStrengthChange={(value) => onChange({ guidanceStrength: value })}
          guidanceUni3cEndPercent={settings.guidanceUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1}
          onGuidanceUni3cEndPercentChange={(value) => onChange({ guidanceUni3cEndPercent: value })}
          guidanceCannyIntensity={settings.guidanceCannyIntensity ?? structureVideoDefaults?.cannyIntensity ?? 1}
          onGuidanceCannyIntensityChange={(value) => onChange({ guidanceCannyIntensity: value })}
          guidanceDepthContrast={settings.guidanceDepthContrast ?? structureVideoDefaults?.depthContrast ?? 1}
          onGuidanceDepthContrastChange={(value) => onChange({ guidanceDepthContrast: value })}
          fieldControls={fieldControls}
        />
      </div>

      {/* Structure Video Browser Modal - Timeline Mode Only */}
      {isTimelineMode && (
        <ResourceBrowserModalBase
          isOpen={videoUpload.showVideoBrowser}
          onOpenChange={videoUpload.setShowVideoBrowser}
          resourceType="structure-video"
          title="Browse Guidance Videos"
          onResourceSelect={videoUpload.handleVideoResourceSelect}
        />
      )}
    </>
  );
};
