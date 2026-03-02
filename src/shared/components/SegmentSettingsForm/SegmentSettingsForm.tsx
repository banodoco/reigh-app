/**
 * SegmentSettingsForm - Controlled Form Component
 *
 * A presentational form for editing segment settings.
 * Parent owns the data and handles persistence/task creation.
 *
 * Usage:
 * ```tsx
 * const { settings, updateSettings, saveSettings } = useSegmentSettings({...});
 *
 * <SegmentSettingsForm
 *   settings={settings}
 *   onChange={updateSettings}
 *   onSubmit={async () => {
 *     await saveSettings();
 *     await createTask();
 *   }}
 * />
 * ```
 */

import React, { useState, useCallback } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { Slider } from '@/shared/components/ui/slider';
import { Loader2, RotateCcw, Save } from 'lucide-react';
import { quantizeFrameCount, framesToSeconds } from '@/shared/lib/videoUtils';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { usePromptFieldState } from '@/shared/hooks/usePromptFieldState';

// Extracted components
import { AdvancedSettingsSection } from './components/AdvancedSettingsSection';
import { PromptSection } from './components/PromptSection';

// Extracted hooks
import { useSaveFieldAsDefault, useStructureVideoUpload } from './hooks';

// Types
import type { SegmentSettingsFormProps } from './types';

// =============================================================================
// COMPONENT
// =============================================================================

export const SegmentSettingsForm: React.FC<SegmentSettingsFormProps> = ({
  settings,
  onChange,
  onSubmit,
  startImageUrl,
  endImageUrl,
  modelName,
  isRegeneration = false,
  isSubmitting = false,
  buttonLabel,
  showHeader = true,
  headerTitle = 'Regenerate Segment',
  maxFrames = 81,
  queryKeyPrefix = 'segment-settings',
  onFrameCountChange,
  onRestoreDefaults,
  onSaveAsShotDefaults,
  onSaveFieldAsDefault,
  hasOverride,
  shotDefaults,
  structureVideoType,
  structureVideoDefaults,
  structureVideoUrl,
  structureVideoFrameRange,
  enhancedPrompt,
  basePromptForEnhancement,
  onClearEnhancedPrompt,
  enhancePromptEnabled,
  onEnhancePromptChange,
  edgeExtendAmount = 4,
  // Per-segment structure video management
  isTimelineMode,
  onAddSegmentStructureVideo,
  onRemoveSegmentStructureVideo,
  // Navigation to constituent images
  startImageShotGenerationId,
  endImageShotGenerationId,
  onNavigateToImage,
}) => {
  // UI state
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [saveDefaultsSuccess, setSaveDefaultsSuccess] = useState(false);
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);

  // Save-field-as-default (shared with AdvancedSettingsSection)
  const { savingField, handleSaveFieldAsDefault } = useSaveFieldAsDefault({
    onSaveFieldAsDefault,
    onChange,
  });

  // Structure video upload hook
  const videoUpload = useStructureVideoUpload({
    structureVideoFrameRange,
    settings,
    structureVideoDefaults,
    onAddSegmentStructureVideo,
  });

  // Prompt field state
  const promptField = usePromptFieldState({
    settingsPrompt: settings.prompt,
    enhancedPrompt,
    basePromptForEnhancement,
    defaultPrompt: shotDefaults?.prompt,
    onSettingsChange: (value) => onChange({ prompt: value }),
    onClearEnhancedPrompt,
  });

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  const handleSubmit = useCallback(async () => {
    setSubmitSuccess(false);
    try {
      await onSubmit();
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 1500);
    } catch (error) {
      normalizeAndPresentError(error, { context: 'SegmentSettingsForm', showToast: false });
    }
  }, [onSubmit]);

  const handleFrameCountChange = useCallback((value: number) => {
    const quantized = quantizeFrameCount(value, 9);
    onChange({ numFrames: quantized });
    onFrameCountChange?.(quantized);
  }, [onChange, onFrameCountChange]);

  const handleSaveAsShotDefaults = useCallback(async () => {
    if (!onSaveAsShotDefaults) return;
    setIsSavingDefaults(true);
    setSaveDefaultsSuccess(false);
    try {
      const success = await onSaveAsShotDefaults();
      if (success) {
        setSaveDefaultsSuccess(true);
        setTimeout(() => setSaveDefaultsSuccess(false), 2000);
      }
    } finally {
      setIsSavingDefaults(false);
    }
  }, [onSaveAsShotDefaults]);

  // Drag and drop handlers for video upload
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingVideo(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDraggingVideo(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingVideo(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/')) {
        videoUpload.handleFileSelect({ target: { files } } as unknown as React.ChangeEvent<HTMLInputElement>);
      }
    }
  }, [videoUpload]);

  // ==========================================================================
  // RENDER
  // ==========================================================================

  return (
    <div className="space-y-4">
      {/* Header */}
      {showHeader && (
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-medium flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-primary" />
            {headerTitle}
          </h3>
        </div>
      )}

      {/* Input Images with Frames Slider */}
      {(startImageUrl || endImageUrl) && (
        <div className="@container overflow-hidden">
          <div className="grid grid-cols-2 gap-2 @[280px]:grid-cols-3">
            {/* Start Image */}
            <div className="relative aspect-video">
              {startImageUrl && (
                <button
                  type="button"
                  onClick={() => startImageShotGenerationId && onNavigateToImage?.(startImageShotGenerationId)}
                  disabled={!onNavigateToImage || !startImageShotGenerationId}
                  className="w-full h-full relative bg-muted/30 rounded-lg overflow-hidden border border-border/50 transition-all hover:ring-2 hover:ring-primary/50 hover:scale-[1.02] disabled:hover:ring-0 disabled:hover:scale-100 disabled:cursor-default"
                  title={onNavigateToImage && startImageShotGenerationId ? "View start image" : undefined}
                >
                  <img
                    src={startImageUrl}
                    alt="Start frame"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0.5 left-0.5 text-[10px] bg-black/60 text-white px-1 rounded">Start</span>
                </button>
              )}
            </div>

            {/* Frames Slider */}
            <div className="order-last col-span-2 @[280px]:order-none @[280px]:col-span-1 flex items-center gap-2">
              <div className="flex-1 flex flex-col justify-center gap-y-1">
                <div className="flex flex-col items-center text-center">
                  <Label className="text-xs font-medium">Frames</Label>
                  <span className="text-xs text-muted-foreground">
                    {settings.numFrames} ({framesToSeconds(settings.numFrames)})
                  </span>
                </div>
                <Slider
                  value={quantizeFrameCount(settings.numFrames, 9)}
                  onValueChange={(value) => {
                    const nextValue = Array.isArray(value)
                      ? (value[0] ?? quantizeFrameCount(settings.numFrames, 9))
                      : value;
                    handleFrameCountChange(nextValue);
                  }}
                  min={9}
                  max={maxFrames}
                  step={4}
                  className="w-full"
                />
              </div>
            </div>

            {/* End Image */}
            <div className="relative aspect-video">
              {endImageUrl && (
                <button
                  type="button"
                  onClick={() => endImageShotGenerationId && onNavigateToImage?.(endImageShotGenerationId)}
                  disabled={!onNavigateToImage || !endImageShotGenerationId}
                  className="w-full h-full relative bg-muted/30 rounded-lg overflow-hidden border border-border/50 transition-all hover:ring-2 hover:ring-primary/50 hover:scale-[1.02] disabled:hover:ring-0 disabled:hover:scale-100 disabled:cursor-default"
                  title={onNavigateToImage && endImageShotGenerationId ? "View end image" : undefined}
                >
                  <img
                    src={endImageUrl}
                    alt="End frame"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0.5 right-0.5 text-[10px] bg-black/60 text-white px-1 rounded">End</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Prompt */}
      <PromptSection
        promptField={promptField}
        isRegeneration={isRegeneration}
        settings={settings}
        onChange={onChange}
        basePromptForEnhancement={basePromptForEnhancement}
        enhancePromptEnabled={enhancePromptEnabled}
        onEnhancePromptChange={onEnhancePromptChange}
        onSaveFieldAsDefault={onSaveFieldAsDefault}
        handleSaveFieldAsDefault={handleSaveFieldAsDefault}
        savingField={savingField}
      />

      {/* Advanced Settings */}
      <AdvancedSettingsSection
        settings={settings}
        onChange={onChange}
        modelName={modelName}
        queryKeyPrefix={queryKeyPrefix}
        edgeExtendAmount={edgeExtendAmount}
        shotDefaults={shotDefaults}
        hasOverride={hasOverride}
        onSaveFieldAsDefault={onSaveFieldAsDefault}
        structureVideoType={structureVideoType}
        structureVideoUrl={structureVideoUrl}
        structureVideoFrameRange={structureVideoFrameRange}
        structureVideoDefaults={structureVideoDefaults}
        isTimelineMode={isTimelineMode}
        onAddSegmentStructureVideo={onAddSegmentStructureVideo}
        onRemoveSegmentStructureVideo={onRemoveSegmentStructureVideo}
        videoUpload={videoUpload}
        isDraggingVideo={isDraggingVideo}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      />

      {/* Submit Button */}
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={isSubmitting || !startImageUrl}
        className="w-full gap-2"
        variant={submitSuccess ? "outline" : "default"}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>Generating...</span>
          </>
        ) : submitSuccess ? (
          <>
            <span className="text-green-600">&#10003;</span>
            <span>Task Created</span>
          </>
        ) : (
          <span>{buttonLabel || (isRegeneration ? 'Regenerate Segment' : 'Generate Segment')}</span>
        )}
      </Button>

      {/* Restore Defaults / Save as Defaults Buttons */}
      {(onRestoreDefaults || onSaveAsShotDefaults) && (
        <div className="flex gap-2">
          {onRestoreDefaults && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRestoreDefaults}
              disabled={isSubmitting || isSavingDefaults}
              className="flex-1 h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              Restore Defaults
            </Button>
          )}
          {onSaveAsShotDefaults && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSaveAsShotDefaults}
              disabled={isSubmitting || isSavingDefaults}
              className="flex-1 h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              {isSavingDefaults ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : saveDefaultsSuccess ? (
                <span className="text-green-600">&#10003;</span>
              ) : (
                <Save className="w-3 h-3" />
              )}
              {saveDefaultsSuccess ? 'Saved!' : 'Set as Shot Defaults'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
