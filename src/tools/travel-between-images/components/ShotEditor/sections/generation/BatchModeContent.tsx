/**
 * BatchModeContent - Batch Generation mode UI
 *
 * Renders the two-column layout with BatchSettingsForm, MotionControl,
 * and GenerateVideoCTA with stitch options.
 *
 * Pulls most data from ShotSettingsContext and VideoTravelSettingsProvider.
 * Only receives refs, parent CTA state, and dimension settings as props.
 */

import React from 'react';
import { ArrowLeftRight, Settings, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { Label } from '@/shared/components/ui/primitives/label';
import { Switch } from '@/shared/components/ui/switch';
import { Slider } from '@/shared/components/ui/slider';

import {
  usePromptSettings,
  useMotionSettings,
  useFrameSettings,
  usePhaseConfigSettings,
  useGenerationModeSettings,
  useLoraSettings,
  useSettingsSave,
  useVideoTravelSettings,
} from '@/tools/travel-between-images/providers';

import {
  useShotCore,
  useShotImages,
  useShotLoras,
  useShotStructureVideo,
  useStructureVideoHandlers,
  useShotUI,
  useGenerationMode,
  useGenerationHandlers,
  useJoinState,
  useDimensions,
} from '../../ShotSettingsContext';

import BatchSettingsForm from '../../../BatchSettingsForm';
import { MotionControl } from '../../../MotionControl';
import { GenerateVideoCTA } from '../../../GenerateVideoCTA';
import { SectionHeader } from '@/shared/components/ImageGenerationForm/components';
import { JoinClipsSettingsForm, DEFAULT_JOIN_CLIPS_PHASE_CONFIG, BUILTIN_JOIN_CLIPS_DEFAULT_ID } from '@/shared/components/JoinClipsSettingsForm';

interface BatchModeContentProps {
  // Refs - must be passed from parent for DOM positioning
  ctaContainerRef?: (node: HTMLDivElement | null) => void;
  swapButtonRef: React.RefObject<HTMLButtonElement>;

  // Parent CTA state - controlled by page-level component
  parentVariantName?: string;
  parentOnVariantNameChange?: (name: string) => void;
  parentIsGeneratingVideo?: boolean;
  parentVideoJustQueued?: boolean;
}

export const BatchModeContent: React.FC<BatchModeContentProps> = ({
  ctaContainerRef,
  swapButtonRef,
  parentVariantName,
  parentOnVariantNameChange,
  parentIsGeneratingVideo,
  parentVideoJustQueued,
}) => {
  // Pull from ShotSettingsContext
  const { projectId, selectedProjectId, projects } = useShotCore();
  const { simpleFilteredImages } = useShotImages();
  const { loraManager, availableLoras } = useShotLoras();
  const structureVideo = useShotStructureVideo();
  const structureVideoHandlers = useStructureVideoHandlers();
  const { state } = useShotUI();
  const generationMode = useGenerationMode();
  const generationHandlers = useGenerationHandlers();
  const joinState = useJoinState();
  const dimensions = useDimensions();

  // Pull from VideoTravelSettingsProvider
  const promptSettings = usePromptSettings();
  const motionSettings = useMotionSettings();
  const frameSettings = useFrameSettings();
  const phaseConfigSettings = usePhaseConfigSettings();
  const generationModeSettings = useGenerationModeSettings();
  const loraSettingsFromContext = useLoraSettings();
  const { isLoading: settingsLoadingFromContext } = useVideoTravelSettings();
  const { onBlurSave: blurSaveHandler } = useSettingsSave();

  // Derive values
  const advancedMode = motionSettings.motionMode === 'advanced';
  const stitchAfterGenerate = joinState.joinSettings.settings.stitchAfterGenerate ?? false;
  const effectiveGenerationMode = generationModeSettings.generationMode;

  // Extract join settings for stitch form
  const {
    prompt: joinPrompt,
    negativePrompt: joinNegativePrompt,
    contextFrameCount: joinContextFrames,
    gapFrameCount: joinGapFrames,
    replaceMode: joinReplaceMode,
    keepBridgingImages: joinKeepBridgingImages,
    enhancePrompt: joinEnhancePrompt,
    motionMode: joinMotionMode,
    phaseConfig: joinPhaseConfig,
    selectedPhasePresetId: joinSelectedPhasePresetId,
    randomSeed: joinRandomSeed,
  } = joinState.joinSettings.settings;

  return (
    <>
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column: Main Settings */}
        <div className="lg:w-1/2 order-2 lg:order-1">
          <div className="mb-4">
            <SectionHeader title="Settings" theme="orange" />
          </div>
          <BatchSettingsForm
            batchVideoPrompt={promptSettings.prompt}
            onBatchVideoPromptChange={generationHandlers.handleBatchVideoPromptChangeWithClear}
            batchVideoFrames={frameSettings.batchVideoFrames}
            onBatchVideoFramesChange={frameSettings.setFrames}
            batchVideoSteps={frameSettings.batchVideoSteps}
            onBatchVideoStepsChange={generationHandlers.handleStepsChange}
            dimensionSource={dimensions.dimensionSource ?? 'project'}
            onDimensionSourceChange={dimensions.onDimensionSourceChange ?? (() => {})}
            customWidth={dimensions.customWidth}
            onCustomWidthChange={dimensions.onCustomWidthChange ?? (() => {})}
            customHeight={dimensions.customHeight}
            onCustomHeightChange={dimensions.onCustomHeightChange ?? (() => {})}
            negativePrompt={promptSettings.negativePrompt}
            onNegativePromptChange={promptSettings.setNegativePrompt}
            projects={projects}
            selectedProjectId={selectedProjectId}
            selectedLoras={loraManager.selectedLoras}
            availableLoras={loraSettingsFromContext.availableLoras}
            isTimelineMode={effectiveGenerationMode === 'timeline'}
            accelerated={generationMode.accelerated}
            onAcceleratedChange={generationMode.onAcceleratedChange}
            showStepsNotification={state.showStepsNotification}
            randomSeed={generationMode.randomSeed}
            onRandomSeedChange={generationMode.onRandomSeedChange}
            turboMode={motionSettings.turboMode}
            onTurboModeChange={motionSettings.setTurboMode}
            smoothContinuations={motionSettings.smoothContinuations}
            amountOfMotion={motionSettings.amountOfMotion}
            onAmountOfMotionChange={motionSettings.setAmountOfMotion}
            imageCount={simpleFilteredImages.length}
            enhancePrompt={promptSettings.enhancePrompt}
            onEnhancePromptChange={promptSettings.setEnhancePrompt}
            advancedMode={advancedMode}
            phaseConfig={phaseConfigSettings.phaseConfig}
            onPhaseConfigChange={phaseConfigSettings.setPhaseConfig}
            selectedPhasePresetId={phaseConfigSettings.selectedPhasePresetId}
            onPhasePresetSelect={phaseConfigSettings.selectPreset}
            onPhasePresetRemove={phaseConfigSettings.removePreset}
            onBlurSave={blurSaveHandler}
            onClearEnhancedPrompts={generationHandlers.clearAllEnhancedPrompts}
            videoControlMode={generationModeSettings.videoControlMode}
            textBeforePrompts={promptSettings.textBeforePrompts}
            onTextBeforePromptsChange={promptSettings.setTextBeforePrompts}
            textAfterPrompts={promptSettings.textAfterPrompts}
            onTextAfterPromptsChange={promptSettings.setTextAfterPrompts}
          />
        </div>

        {/* Right Column: Motion Control */}
        <div className="lg:w-1/2 order-1 lg:order-2">
          <div className="mb-4">
            <SectionHeader title="Motion" theme="purple" />
          </div>

          {/* Camera Guidance - shown only when structure video is present */}
          {structureVideo.structureVideoPath && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-muted-foreground mb-3">Camera Guidance:</h4>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Strength:</Label>
                      <span className="text-sm font-medium">{structureVideo.structureVideoMotionStrength.toFixed(1)}x</span>
                    </div>
                    <Slider
                      value={structureVideo.structureVideoMotionStrength}
                      onValueChange={(value) => {
                        const nextValue = Array.isArray(value) ? value[0] ?? structureVideo.structureVideoMotionStrength : value;
                        structureVideoHandlers.handleStructureVideoMotionStrengthChange(nextValue);
                      }}
                      min={0}
                      max={2}
                      step={0.1}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0x</span>
                      <span>1x</span>
                      <span>2x</span>
                    </div>
                  </div>
                  {structureVideo.structureVideoType === 'uni3c' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">End:</Label>
                        <span className="text-sm font-medium">{(structureVideo.structureVideoUni3cEndPercent * 100).toFixed(0)}%</span>
                      </div>
                      <Slider
                        value={structureVideo.structureVideoUni3cEndPercent}
                        onValueChange={(value) => {
                          const nextValue = Array.isArray(value) ? value[0] ?? structureVideo.structureVideoUni3cEndPercent : value;
                          structureVideoHandlers.handleUni3cEndPercentChange(nextValue);
                        }}
                        min={0}
                        max={1}
                        step={0.05}
                        className="w-full"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>0%</span>
                        <span>50%</span>
                        <span>100%</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {structureVideo.structureVideoPath && (
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Model Guidance:</h4>
          )}
          <MotionControl
            mode={{
              motionMode: motionSettings.motionMode || 'basic',
              onMotionModeChange: motionSettings.setMotionMode,
              generationTypeMode: phaseConfigSettings.generationTypeMode,
              onGenerationTypeModeChange: phaseConfigSettings.setGenerationTypeMode,
              hasStructureVideo: !!structureVideo.structureVideoPath,
            }}
            lora={{
              selectedLoras: loraManager.selectedLoras,
              availableLoras: loraSettingsFromContext.availableLoras,
              onAddLoraClick: () => loraManager.setIsLoraModalOpen(true),
              onRemoveLora: loraManager.handleRemoveLora,
              onLoraStrengthChange: loraManager.handleLoraStrengthChange,
              onAddTriggerWord: loraManager.handleAddTriggerWord,
              renderLoraHeaderActions: loraManager.renderHeaderActions,
            }}
            presets={{
              selectedPhasePresetId: phaseConfigSettings.selectedPhasePresetId,
              onPhasePresetSelect: phaseConfigSettings.selectPreset,
              onPhasePresetRemove: phaseConfigSettings.removePreset,
              currentSettings: generationMode.currentMotionSettings,
            }}
            advanced={{
              phaseConfig: phaseConfigSettings.phaseConfig,
              onPhaseConfigChange: phaseConfigSettings.setPhaseConfig,
              onBlurSave: blurSaveHandler,
              randomSeed: generationMode.randomSeed,
              onRandomSeedChange: generationMode.onRandomSeedChange,
              onRestoreDefaults: phaseConfigSettings.restoreDefaults,
            }}
            stateOverrides={{
              turboMode: motionSettings.turboMode,
              settingsLoading: settingsLoadingFromContext,
              smoothContinuations: motionSettings.smoothContinuations,
              onSmoothContinuationsChange: motionSettings.setSmoothContinuations,
            }}
          />
        </div>
      </div>

      {/* Generate CTA */}
      <div ref={ctaContainerRef} className="mt-6 pt-6 border-t">
        <GenerateVideoCTA
          variantName={parentVariantName || ''}
          onVariantNameChange={parentOnVariantNameChange || (() => {})}
          onGenerate={() => generationHandlers.handleGenerateBatch(parentVariantName || '')}
          isGenerating={parentIsGeneratingVideo || generationMode.isSteerableMotionEnqueuing}
          justQueued={parentVideoJustQueued || generationMode.steerableMotionJustQueued}
          disabled={generationMode.isGenerationDisabled}
          inputId="variant-name"
          videoCount={Math.max(0, simpleFilteredImages.length - 1)}
          stitchEnabled={stitchAfterGenerate}
          middleContent={
            simpleFilteredImages.length > 2 ? (
              stitchAfterGenerate ? (
                <Collapsible className="mb-6 w-full">
                  <div className="flex items-center justify-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="stitch-after-generate"
                        checked={stitchAfterGenerate}
                        onCheckedChange={(checked) => joinState.joinSettings.updateField('stitchAfterGenerate', checked)}
                      />
                      <Label htmlFor="stitch-after-generate" className="text-sm font-normal cursor-pointer">
                        Stitch generated clips
                      </Label>
                    </div>
                    <CollapsibleTrigger className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors group">
                      <Settings className="w-4 h-4" />
                      <span>Settings</span>
                      <ChevronDown className="w-3 h-3 transition-transform group-data-[panel-open]:rotate-180" />
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent className="mt-4 pt-4 border-t">
                    <JoinClipsSettingsForm
                      clipSettings={{
                        gapFrames: joinGapFrames,
                        setGapFrames: (val) => joinState.joinSettings.updateField('gapFrameCount', val),
                        contextFrames: joinContextFrames,
                        setContextFrames: (val) => joinState.joinSettings.updateField('contextFrameCount', val),
                        replaceMode: joinReplaceMode,
                        setReplaceMode: (val) => joinState.joinSettings.updateField('replaceMode', val),
                        keepBridgingImages: joinKeepBridgingImages,
                        setKeepBridgingImages: (val) => joinState.joinSettings.updateField('keepBridgingImages', val),
                        prompt: joinPrompt,
                        setPrompt: (val) => joinState.joinSettings.updateField('prompt', val),
                        negativePrompt: joinNegativePrompt,
                        setNegativePrompt: (val) => joinState.joinSettings.updateField('negativePrompt', val),
                        enhancePrompt: joinEnhancePrompt,
                        setEnhancePrompt: (val) => joinState.joinSettings.updateField('enhancePrompt', val),
                        shortestClipFrames: joinState.joinValidationData.shortestClipFrames,
                      }}
                      motionConfig={{
                        availableLoras,
                        projectId,
                        loraPersistenceKey: 'join-clips-shot-editor-stitch',
                        loraManager: joinState.joinLoraManager,
                        motionMode: joinMotionMode,
                        onMotionModeChange: (mode) => joinState.joinSettings.updateField('motionMode', mode),
                        phaseConfig: joinPhaseConfig ?? DEFAULT_JOIN_CLIPS_PHASE_CONFIG,
                        onPhaseConfigChange: (config) => joinState.joinSettings.updateField('phaseConfig', config),
                        randomSeed: joinRandomSeed,
                        onRandomSeedChange: (val) => joinState.joinSettings.updateField('randomSeed', val),
                        selectedPhasePresetId: joinSelectedPhasePresetId ?? BUILTIN_JOIN_CLIPS_DEFAULT_ID,
                        onPhasePresetSelect: (presetId, config) => {
                          joinState.joinSettings.updateFields({
                            selectedPhasePresetId: presetId,
                            phaseConfig: config,
                          });
                        },
                        onPhasePresetRemove: () => {
                          joinState.joinSettings.updateField('selectedPhasePresetId', null);
                        },
                      }}
                      uiState={{
                        onGenerate: () => {},
                        isGenerating: false,
                        generateSuccess: false,
                        generateButtonText: '',
                        showGenerateButton: false,
                        onRestoreDefaults: joinState.handleRestoreJoinDefaults,
                      }}
                    />
                  </CollapsibleContent>
                </Collapsible>
              ) : (
                <div className="mb-6 flex items-center justify-center gap-2">
                  <Switch
                    id="stitch-after-generate"
                    checked={stitchAfterGenerate}
                    onCheckedChange={(checked) => joinState.joinSettings.updateField('stitchAfterGenerate', checked)}
                  />
                  <Label htmlFor="stitch-after-generate" className="text-sm font-normal cursor-pointer">
                    Stitch generated clips
                  </Label>
                </div>
              )
            ) : undefined
          }
          bottomContent={
            simpleFilteredImages.length > 2 ? (
              <button
                ref={swapButtonRef}
                onClick={() => generationMode.toggleGenerateModePreserveScroll('join')}
                className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors pt-2"
              >
                <ArrowLeftRight className="w-4 h-4" />
                <span>Swap to Join Segments</span>
              </button>
            ) : undefined
          }
        />
      </div>
    </>
  );
};
