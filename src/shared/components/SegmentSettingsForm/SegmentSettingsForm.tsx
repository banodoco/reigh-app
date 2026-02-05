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

import React, { useState, useCallback, useMemo } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { ChevronLeft, Loader2, RotateCcw, Save, Video, X, Images } from 'lucide-react';
import { MotionPresetSelector } from '@/shared/components/MotionPresetSelector';
import { detectGenerationMode, BUILTIN_I2V_PRESET, BUILTIN_VACE_PRESET, SEGMENT_I2V_FEATURED_PRESET_IDS, SEGMENT_VACE_FEATURED_PRESET_IDS } from '../segmentSettingsUtils';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { DefaultableTextarea } from '@/shared/components/DefaultableTextarea';
import { DatasetBrowserModal } from '@/shared/components/DatasetBrowserModal';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { usePublicLoras, type LoraModel } from '@/shared/hooks/useResources';
import { quantizeFrameCount, framesToSeconds } from '@/shared/lib/videoUtils';
import { handleError } from '@/shared/lib/errorHandler';
import { usePromptFieldState } from '@/shared/hooks/usePromptFieldState';
import type { PhaseConfig } from '@/shared/types/phaseConfig';

// Extracted components
import {
  FieldDefaultControls,
  EnhancedPromptBadge,
  StructureVideoPreview,
  VideoPreviewSkeleton,
} from './components';

// Extracted hooks
import { useStructureVideoUpload } from './hooks';

// Types
import type { SegmentSettingsFormProps, SegmentSettings } from './types';
import { stripModeFromPhaseConfig } from '../segmentSettingsUtils';

// =============================================================================
// COMPONENT
// =============================================================================

export const SegmentSettingsForm: React.FC<SegmentSettingsFormProps> = ({
  settings,
  onChange,
  onSubmit,
  segmentIndex = 0,
  startImageUrl,
  endImageUrl,
  modelName,
  resolution,
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
  isDirty,
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
  onUpdateSegmentStructureVideo,
  onRemoveSegmentStructureVideo,
  // Navigation to constituent images
  startImageShotGenerationId,
  endImageShotGenerationId,
  onNavigateToImage,
}) => {
  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [isSavingDefaults, setIsSavingDefaults] = useState(false);
  const [saveDefaultsSuccess, setSaveDefaultsSuccess] = useState(false);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);

  // Structure video upload hook
  const videoUpload = useStructureVideoUpload({
    structureVideoFrameRange,
    settings,
    structureVideoDefaults,
    onAddSegmentStructureVideo,
  });

  // Fetch available LoRAs
  const { data: availableLoras = [] } = usePublicLoras();

  // Detect generation mode from model name
  const generationMode = useMemo(() => {
    return detectGenerationMode(modelName);
  }, [modelName]);

  // Get built-in preset and featured IDs for current mode
  const builtinPreset = useMemo(() => {
    return generationMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET;
  }, [generationMode]);

  const featuredPresetIds = useMemo(() => {
    return generationMode === 'vace' ? SEGMENT_VACE_FEATURED_PRESET_IDS : SEGMENT_I2V_FEATURED_PRESET_IDS;
  }, [generationMode]);

  // Compute effective loras
  const effectiveLoras = useMemo(() => {
    if (settings.loras !== undefined) {
      return settings.loras;
    }
    return shotDefaults?.loras ?? [];
  }, [settings.loras, shotDefaults?.loras]);

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
      setTimeout(() => setSubmitSuccess(false), 2000);
    } catch (error) {
      handleError(error, { context: 'SegmentSettingsForm', showToast: false });
    }
  }, [onSubmit]);

  const handleMotionModeChange = useCallback((mode: 'basic' | 'advanced') => {
    onChange({
      motionMode: mode,
      phaseConfig: mode === 'basic' ? undefined : (settings.phaseConfig ?? shotDefaults?.phaseConfig),
    });
  }, [onChange, settings.phaseConfig, shotDefaults?.phaseConfig]);

  const handlePhaseConfigChange = useCallback((config: PhaseConfig) => {
    onChange({
      phaseConfig: stripModeFromPhaseConfig(config),
    });
  }, [onChange]);

  const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig) => {
    onChange({
      selectedPhasePresetId: presetId,
      phaseConfig: stripModeFromPhaseConfig(config),
    });
  }, [onChange]);

  const handlePhasePresetRemove = useCallback(() => {
    onChange({ selectedPhasePresetId: null });
  }, [onChange]);

  const handleRandomSeedChange = useCallback((value: boolean) => {
    onChange({ randomSeed: value });
  }, [onChange]);

  const handleAddLoraClick = useCallback(() => {
    setIsLoraModalOpen(true);
  }, []);

  const handleLoraSelect = useCallback((lora: LoraModel) => {
    const loraId = lora['Model ID'] || (lora.id as string);
    const loraPath = lora['Model Files']?.[0]?.url || (lora['Model File'] as string | undefined);
    const loraName = lora.Name || (lora.name as string | undefined);

    if (!loraPath) return;
    const currentLoras = effectiveLoras;
    if (currentLoras.some(l => l.id === loraId || l.path === loraPath)) return;

    onChange({
      loras: [...currentLoras, {
        id: loraId,
        name: loraName,
        path: loraPath,
        strength: 1.0,
      }],
    });
  }, [effectiveLoras, onChange]);

  const handleRemoveLora = useCallback((loraId: string) => {
    const currentLoras = effectiveLoras;
    onChange({
      loras: currentLoras.filter(l => l.id !== loraId && l.path !== loraId),
    });
  }, [effectiveLoras, onChange]);

  const handleLoraStrengthChange = useCallback((loraId: string, strength: number) => {
    const currentLoras = effectiveLoras;
    onChange({
      loras: currentLoras.map(l =>
        (l.id === loraId || l.path === loraId) ? { ...l, strength } : l
      ),
    });
  }, [effectiveLoras, onChange]);

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

  const handleSaveFieldAsDefault = useCallback(async (field: keyof SegmentSettings, value: SegmentSettings[keyof SegmentSettings]) => {
    if (!onSaveFieldAsDefault) return;
    setSavingField(field);
    try {
      const success = await onSaveFieldAsDefault(field, value);
      if (success) {
        await new Promise(resolve => setTimeout(resolve, 0));
        onChange({ [field]: undefined } as Partial<SegmentSettings>);
      }
    } finally {
      setSavingField(null);
    }
  }, [onSaveFieldAsDefault, onChange]);

  // Drag and drop handlers for video upload
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Check if dragging files (not text or other content)
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingVideo(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if leaving the drop zone (not entering a child)
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
      // Check if it's a video file
      if (file.type.startsWith('video/')) {
        // Trigger the file select handler with a synthetic event
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
              <div className="flex-1 flex flex-col justify-center space-y-1">
                <div className="flex flex-col items-center text-center">
                  <Label className="text-xs font-medium">Frames</Label>
                  <span className="text-xs text-muted-foreground">
                    {settings.numFrames} ({framesToSeconds(settings.numFrames)})
                  </span>
                </div>
                <Slider
                  value={[quantizeFrameCount(settings.numFrames, 9)]}
                  onValueChange={([value]) => handleFrameCountChange(value)}
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
      <div className="space-y-2">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium">Prompt:</Label>
            {promptField.badgeType === 'enhanced' && (
              <EnhancedPromptBadge
                onClear={promptField.handleClearEnhanced}
                onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault('prompt', promptField.displayValue) : undefined}
                isSaving={savingField === 'prompt'}
                basePrompt={basePromptForEnhancement}
              />
            )}
            {promptField.badgeType === 'default' && (
              <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                Default
              </span>
            )}
            {promptField.badgeType === null && promptField.userHasSetPrompt && (
              <FieldDefaultControls
                isUsingDefault={false}
                onUseDefault={promptField.handleClearAll}
                onSetAsDefault={onSaveFieldAsDefault ? () => handleSaveFieldAsDefault('prompt', promptField.displayValue) : undefined}
                isSaving={savingField === 'prompt'}
              />
            )}
          </div>
          <Textarea
            value={promptField.displayValue}
            onChange={(e) => promptField.handleChange(e.target.value)}
            className="h-20 text-sm resize-none"
            placeholder="Describe this segment..."
            clearable
            onClear={promptField.handleClearAll}
            voiceInput
            voiceContext="This is a prompt for a video segment. Describe the motion, action, or visual content you want in this part of the video."
            onVoiceResult={promptField.handleVoiceResult}
          />
        </div>

        {/* Enhance Prompt Toggle & Make Primary Variant */}
        <div className="flex gap-2">
          {onEnhancePromptChange && (
            <div className="flex items-center space-x-2 p-2 bg-muted/30 rounded-lg border flex-1">
              <Switch
                id="enhance-prompt-segment"
                checked={enhancePromptEnabled ?? false}
                onCheckedChange={onEnhancePromptChange}
              />
              <Label htmlFor="enhance-prompt-segment" className="text-sm font-medium cursor-pointer flex-1">
                Enhance Prompt
              </Label>
            </div>
          )}
          <div className="flex items-center space-x-2 p-2 bg-muted/30 rounded-lg border flex-1">
            <Switch
              id="make-primary-segment"
              checked={isRegeneration ? settings.makePrimaryVariant : true}
              onCheckedChange={isRegeneration ? (value) => onChange({ makePrimaryVariant: value }) : undefined}
              disabled={!isRegeneration}
            />
            <Label htmlFor="make-primary-segment" className="text-sm font-medium cursor-pointer flex-1">
              Make Primary
            </Label>
          </div>
        </div>
      </div>

      {/* Advanced Settings */}
      <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`w-full justify-between h-9 text-xs font-medium ${
              showAdvanced
                ? 'bg-muted text-foreground hover:bg-muted rounded-b-none'
                : 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
            }`}
          >
            <span>Advanced Settings</span>
            <ChevronLeft className={`w-3 h-3 transition-transform ${showAdvanced ? '-rotate-90' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className={edgeExtendAmount === 6 ? '-mx-6' : '-mx-4'}>
          <div className={`space-y-3 bg-muted/30 border-y border-border/50 ${edgeExtendAmount === 6 ? 'px-6 py-3' : 'px-4 py-3'}`}>
            {/* Before/After Each Prompt */}
            {(shotDefaults?.textBeforePrompts !== undefined || shotDefaults?.textAfterPrompts !== undefined) && (
              <div className="space-y-2">
                <DefaultableTextarea
                  label="Before:"
                  value={settings.textBeforePrompts}
                  defaultValue={shotDefaults?.textBeforePrompts}
                  hasDbOverride={hasOverride?.textBeforePrompts}
                  onChange={(value) => onChange({ textBeforePrompts: value })}
                  onClear={() => onChange({ textBeforePrompts: '' })}
                  onUseDefault={() => onChange({ textBeforePrompts: undefined })}
                  onSetAsDefault={onSaveFieldAsDefault ? (displayValue) => handleSaveFieldAsDefault('textBeforePrompts', displayValue) : undefined}
                  isSavingDefault={savingField === 'textBeforePrompts'}
                  className="min-h-0 h-8 text-xs resize-none py-1.5 overflow-hidden"
                  placeholder="Text to prepend..."
                  voiceInput
                  voiceContext="This is text to prepend before video prompts. Keep it brief - style keywords, quality tags, or consistent elements."
                  onVoiceResult={(result) => {
                    onChange({ textBeforePrompts: result.prompt || result.transcription });
                  }}
                />
                <DefaultableTextarea
                  label="After:"
                  value={settings.textAfterPrompts}
                  defaultValue={shotDefaults?.textAfterPrompts}
                  hasDbOverride={hasOverride?.textAfterPrompts}
                  onChange={(value) => onChange({ textAfterPrompts: value })}
                  onClear={() => onChange({ textAfterPrompts: '' })}
                  onUseDefault={() => onChange({ textAfterPrompts: undefined })}
                  onSetAsDefault={onSaveFieldAsDefault ? (displayValue) => handleSaveFieldAsDefault('textAfterPrompts', displayValue) : undefined}
                  isSavingDefault={savingField === 'textAfterPrompts'}
                  className="min-h-0 h-8 text-xs resize-none py-1.5 overflow-hidden"
                  placeholder="Text to append..."
                  voiceInput
                  voiceContext="This is text to append after video prompts. Keep it brief - style keywords, quality tags, or consistent elements."
                  onVoiceResult={(result) => {
                    onChange({ textAfterPrompts: result.prompt || result.transcription });
                  }}
                />
              </div>
            )}

            {/* Negative Prompt */}
            <DefaultableTextarea
              label="Negative Prompt:"
              value={settings.negativePrompt}
              defaultValue={shotDefaults?.negativePrompt}
              hasDbOverride={hasOverride?.negativePrompt}
              onChange={(value) => onChange({ negativePrompt: value })}
              onClear={() => onChange({ negativePrompt: '' })}
              onUseDefault={() => onChange({ negativePrompt: undefined })}
              onSetAsDefault={onSaveFieldAsDefault ? (displayValue) => handleSaveFieldAsDefault('negativePrompt', displayValue) : undefined}
              isSavingDefault={savingField === 'negativePrompt'}
              className="h-16 text-xs resize-none"
              placeholder="Things to avoid..."
              voiceInput
              voiceContext="This is a negative prompt - things to AVOID in video generation. List unwanted qualities as a comma-separated list."
              onVoiceResult={(result) => {
                onChange({ negativePrompt: result.prompt || result.transcription });
              }}
              containerClassName="space-y-1.5"
            />

            {/* Motion Controls */}
            {(() => {
              const isUsingMotionModeDefault = settings.motionMode === undefined && !!shotDefaults?.motionMode;
              const isUsingPhaseConfigDefault = settings.phaseConfig === undefined && !!shotDefaults?.phaseConfig;
              const isUsingLorasDefault = settings.loras === undefined && (shotDefaults?.loras?.length ?? 0) > 0;
              const isUsingMotionDefaults = isUsingMotionModeDefault && isUsingPhaseConfigDefault;

              return (
                <MotionPresetSelector
                  builtinPreset={builtinPreset}
                  featuredPresetIds={featuredPresetIds}
                  generationTypeMode={generationMode}
                  selectedPhasePresetId={settings.selectedPhasePresetId ?? shotDefaults?.selectedPhasePresetId ?? null}
                  phaseConfig={settings.phaseConfig ?? shotDefaults?.phaseConfig ?? builtinPreset.metadata.phaseConfig}
                  motionMode={settings.motionMode ?? shotDefaults?.motionMode ?? 'basic'}
                  onPresetSelect={handlePhasePresetSelect}
                  onPresetRemove={handlePhasePresetRemove}
                  onModeChange={handleMotionModeChange}
                  onPhaseConfigChange={handlePhaseConfigChange}
                  availableLoras={availableLoras}
                  randomSeed={settings.randomSeed}
                  onRandomSeedChange={handleRandomSeedChange}
                  queryKeyPrefix={queryKeyPrefix}
                  labelSuffix={
                    <FieldDefaultControls
                      isUsingDefault={isUsingMotionDefaults}
                      onUseDefault={() => onChange({ motionMode: undefined, phaseConfig: undefined, selectedPhasePresetId: undefined })}
                      onSetAsDefault={onSaveFieldAsDefault ? async () => {
                        await handleSaveFieldAsDefault('motionMode', settings.motionMode ?? shotDefaults?.motionMode ?? 'basic');
                        await handleSaveFieldAsDefault('phaseConfig', settings.phaseConfig ?? shotDefaults?.phaseConfig);
                        await handleSaveFieldAsDefault('selectedPhasePresetId', settings.selectedPhasePresetId ?? shotDefaults?.selectedPhasePresetId ?? null);
                      } : undefined}
                      isSaving={savingField === 'motionMode' || savingField === 'phaseConfig' || savingField === 'selectedPhasePresetId'}
                    />
                  }
                  renderBasicModeContent={() => (
                    <div className="space-y-3">
                      <div className="relative">
                        <ActiveLoRAsDisplay
                          selectedLoras={effectiveLoras}
                          onRemoveLora={handleRemoveLora}
                          onLoraStrengthChange={handleLoraStrengthChange}
                          availableLoras={availableLoras}
                        />
                        <div className="absolute -top-1 -right-1 z-10">
                          <FieldDefaultControls
                            isUsingDefault={isUsingLorasDefault}
                            onUseDefault={() => onChange({
                              loras: undefined,
                              motionMode: undefined,
                              phaseConfig: undefined,
                              selectedPhasePresetId: undefined,
                            })}
                            onSetAsDefault={onSaveFieldAsDefault ? async () => {
                              await handleSaveFieldAsDefault('loras', effectiveLoras);
                              await handleSaveFieldAsDefault('motionMode', 'basic');
                            } : undefined}
                            isSaving={savingField === 'loras' || savingField === 'motionMode'}
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleAddLoraClick}
                        className="w-full text-sm text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 rounded-lg py-2 transition-colors"
                      >
                        Add or manage LoRAs
                      </button>
                    </div>
                  )}
                />
              );
            })()}

            {/* Structure Video Section */}
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
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
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
                onDragOver={isTimelineMode ? handleDragOver : undefined}
                onDragEnter={isTimelineMode ? handleDragEnter : undefined}
                onDragLeave={isTimelineMode ? handleDragLeave : undefined}
                onDrop={isTimelineMode ? handleDrop : undefined}
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
                    value={[settings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2]}
                    onValueChange={([value]) => onChange({ structureMotionStrength: value })}
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
                      value={[settings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1]}
                      onValueChange={([value]) => onChange({ structureUni3cEndPercent: value })}
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
          </div>

          {/* LoRA Selector Modal */}
          <LoraSelectorModal
            isOpen={isLoraModalOpen}
            onClose={() => setIsLoraModalOpen(false)}
            loras={availableLoras}
            onAddLora={handleLoraSelect}
            onRemoveLora={handleRemoveLora}
            onUpdateLoraStrength={handleLoraStrengthChange}
            selectedLoras={(effectiveLoras).map(lora => {
              const fullLora = availableLoras.find(l => l.id === lora.id || l.path === lora.path);
              return {
                ...fullLora,
                "Model ID": lora.id,
                Name: lora.name,
                strength: lora.strength,
              } as LoraModel & { strength: number };
            })}
            lora_type="Wan I2V"
          />

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
        </CollapsibleContent>
      </Collapsible>

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
            <span className="text-green-600">✓</span>
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
                <span className="text-green-600">✓</span>
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
