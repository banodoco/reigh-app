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
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Loader2, Video, X, Images } from 'lucide-react';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { DatasetBrowserModal } from '@/shared/components/DatasetBrowserModal';
import { FieldDefaultControls } from './FieldDefaultControls';
import { StructureVideoPreview } from './StructureVideoPreview';
import { VideoPreviewSkeleton } from './VideoPreviewSkeleton';
import type { useStructureVideoUpload } from '../hooks';
import type { SegmentSettings } from '../types';

interface StructureVideoSectionProps {
  // Structure video context
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
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
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  };

  // Settings
  settings: SegmentSettings;
  onChange: (updates: Partial<SegmentSettings>) => void;

  // Timeline mode
  isTimelineMode?: boolean;
  onAddSegmentStructureVideo?: (video: unknown) => void;
  onRemoveSegmentStructureVideo?: () => void;

  // Video upload hook return
  videoUpload: ReturnType<typeof useStructureVideoUpload>;

  // Drag state
  isDraggingVideo: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;

  // Default controls
  onSaveFieldAsDefault?: (field: keyof SegmentSettings, value: SegmentSettings[keyof SegmentSettings]) => Promise<boolean>;
  handleSaveFieldAsDefault: (field: keyof SegmentSettings, value: SegmentSettings[keyof SegmentSettings]) => Promise<void>;
  savingField: string | null;
}

export const StructureVideoSection: React.FC<StructureVideoSectionProps> = ({
  structureVideoType,
  structureVideoUrl,
  structureVideoFrameRange,
  structureVideoDefaults,
  settings,
  onChange,
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

      {/* Structure Video Overrides - shown when segment has structure video */}
      {structureVideoType && (
        <div
          className="space-y-3 pt-3 border-t border-border/50"
          onDragOver={isTimelineMode ? onDragOver : undefined}
          onDragEnter={isTimelineMode ? onDragEnter : undefined}
          onDragLeave={isTimelineMode ? onDragLeave : undefined}
          onDrop={isTimelineMode ? onDrop : undefined}
        >
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Video className="w-3.5 h-3.5" />
            <span>Structure Video {isTimelineMode ? '' : 'Overrides'}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/80">
              {structureVideoType === 'uni3c' ? 'Uni3C' : structureVideoType === 'flow' ? 'Optical Flow' : structureVideoType === 'canny' ? 'Canny' : structureVideoType === 'depth' ? 'Depth' : structureVideoType}
            </span>
          </div>

          {/* 3-Frame Preview with Remove button overlay */}
          {structureVideoUrl && structureVideoFrameRange && (
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
                  treatment={settings.structureTreatment ?? structureVideoDefaults?.treatment ?? 'adjust'}
                  onLoadComplete={videoUpload.handleVideoPreviewLoaded}
                />
              )}
            </div>
          )}
          {/* Skeleton when no preview URL yet but loading */}
          {videoUpload.isVideoLoading && !structureVideoUrl && structureVideoFrameRange && (
            <VideoPreviewSkeleton message="Loading video..." />
          )}

          {/* Treatment Mode Selector with Upload/Browse - Timeline Mode Only */}
          {isTimelineMode && (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs font-medium">Treatment:</Label>
                  <SegmentedControl
                    value={settings.structureTreatment ?? structureVideoDefaults?.treatment ?? 'adjust'}
                    onValueChange={(v) => onChange({ structureTreatment: v as 'adjust' | 'clip' })}
                    className="w-full mt-1"
                    size="sm"
                  >
                    <SegmentedControlItem
                      value="adjust"
                      className="flex-1"
                      title="Stretch or compress video to match segment duration"
                    >
                      Fit to Range
                    </SegmentedControlItem>
                    <SegmentedControlItem
                      value="clip"
                      className="flex-1"
                      title="Use video frames directly — extra frames are trimmed if video is longer"
                    >
                      1:1 Mapping
                    </SegmentedControlItem>
                  </SegmentedControl>
                </div>
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
          )}

          {/* Motion Strength */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">Strength:</Label>
                <FieldDefaultControls
                  isUsingDefault={settings.structureMotionStrength === undefined}
                  onUseDefault={() => onChange({ structureMotionStrength: undefined })}
                  onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
                    'structureMotionStrength',
                    settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2
                  ) : undefined}
                  isSaving={savingField === 'structureMotionStrength'}
                />
              </div>
              <span className="text-xs font-medium">
                {(settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2).toFixed(1)}x
              </span>
            </div>
            <Slider
              value={settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2}
              onValueChange={(value) => onChange({ structureMotionStrength: value })}
              min={0}
              max={2}
              step={0.1}
              className="w-full"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>0x</span>
              <span>1x</span>
              <span>2x</span>
            </div>
          </div>

          {/* Uni3C End Percent */}
          {structureVideoType === 'uni3c' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-medium">End Percent:</Label>
                  <FieldDefaultControls
                    isUsingDefault={settings.structureUni3cEndPercent === undefined}
                    onUseDefault={() => onChange({ structureUni3cEndPercent: undefined })}
                    onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault(
                      'structureUni3cEndPercent',
                      settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1
                    ) : undefined}
                    isSaving={savingField === 'structureUni3cEndPercent'}
                  />
                </div>
                <span className="text-xs font-medium">
                  {((settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1) * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                value={settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1}
                onValueChange={(value) => onChange({ structureUni3cEndPercent: value })}
                min={0}
                max={1}
                step={0.05}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0%</span>
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Structure Video Browser Modal - Timeline Mode Only */}
      {isTimelineMode && (
        <DatasetBrowserModal
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
