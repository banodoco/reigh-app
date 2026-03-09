import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { type JoinClipsSettingsFormProps } from './types';
import { JOIN_CLIPS_FEATURED_PRESET_IDS } from './constants';
import { useJoinClipsSettingsController } from './hooks/useJoinClipsSettingsController';
import { JoinClipsGenerateButton } from './components/JoinClipsGenerateButton';
import { JoinClipsMotionSettings } from './components/JoinClipsMotionSettings';
import { JoinClipsPromptSettings } from './components/JoinClipsPromptSettings';
import { JoinClipsStructureSettings } from './components/JoinClipsStructureSettings';

// =============================================================================
// EXPORTS FOR BACKWARDS COMPATIBILITY
// =============================================================================
export {
  DEFAULT_JOIN_CLIPS_PHASE_CONFIG,
  BUILTIN_JOIN_CLIPS_DEFAULT_ID,
} from './constants';

export const JoinClipsSettingsForm: React.FC<JoinClipsSettingsFormProps> = ({
  clipSettings,
  motionConfig,
  uiState,
}) => {
  const {
    gapFrames,
    setGapFrames,
    contextFrames,
    setContextFrames,
    replaceMode,
    setReplaceMode,
    keepBridgingImages,
    setKeepBridgingImages,
    prompt,
    setPrompt,
    negativePrompt,
    setNegativePrompt,
    useIndividualPrompts,
    setUseIndividualPrompts,
    clipCount = 2,
    enhancePrompt,
    setEnhancePrompt,
    useInputVideoResolution,
    setUseInputVideoResolution,
    showResolutionToggle = false,
    useInputVideoFps,
    setUseInputVideoFps,
    showFpsToggle = false,
    noisedInputVideo = 0,
    setNoisedInputVideo,
    shortestClipFrames,
    clipPairs,
  } = clipSettings;
  const {
    availableLoras,
    projectId,
    loraPersistenceKey,
    loraManager,
    motionMode = 'basic',
    onMotionModeChange,
    phaseConfig,
    onPhaseConfigChange,
    randomSeed = true,
    onRandomSeedChange,
    selectedPhasePresetId,
    onPhasePresetSelect,
    onPhasePresetRemove,
    featuredPresetIds = JOIN_CLIPS_FEATURED_PRESET_IDS,
  } = motionConfig;
  const {
    onGenerate,
    isGenerating,
    generateSuccess,
    generateButtonText,
    isGenerateDisabled = false,
    onRestoreDefaults,
    className,
    headerContent,
    showGenerateButton = true,
  } = uiState;

  const keepBridgingImagesValue = keepBridgingImages ?? false;

  const {
    maxGapFrames,
    maxContextFrames,
    minClipFramesRequired,
    actualTotal,
    quantizedTotal,
    handleContextFramesChange,
    sliderNumber,
  } = useJoinClipsSettingsController({
    gapFrames,
    setGapFrames,
    contextFrames,
    setContextFrames,
    replaceMode,
    shortestClipFrames,
    keepBridgingImagesValue,
    setKeepBridgingImages,
  });

  return (
    <div className={cn('space-y-8', className)}>
      {headerContent && <div className="mb-6">{headerContent}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <JoinClipsPromptSettings
          prompt={prompt}
          setPrompt={setPrompt}
          negativePrompt={negativePrompt}
          setNegativePrompt={setNegativePrompt}
          useIndividualPrompts={useIndividualPrompts}
          setUseIndividualPrompts={setUseIndividualPrompts}
          clipCount={clipCount}
          enhancePrompt={enhancePrompt}
          setEnhancePrompt={setEnhancePrompt}
        />
        <JoinClipsMotionSettings
          availableLoras={availableLoras}
          projectId={projectId}
          loraPersistenceKey={loraPersistenceKey}
          loraManager={loraManager}
          motionMode={motionMode}
          onMotionModeChange={onMotionModeChange}
          phaseConfig={phaseConfig}
          onPhaseConfigChange={onPhaseConfigChange}
          randomSeed={randomSeed}
          onRandomSeedChange={onRandomSeedChange}
          selectedPhasePresetId={selectedPhasePresetId}
          onPhasePresetSelect={onPhasePresetSelect}
          onPhasePresetRemove={onPhasePresetRemove}
          featuredPresetIds={featuredPresetIds}
        />
      </div>

      <div className="h-px bg-border/50" />

      <JoinClipsStructureSettings
        gapFrames={gapFrames}
        setGapFrames={setGapFrames}
        contextFrames={contextFrames}
        replaceMode={replaceMode}
        setReplaceMode={setReplaceMode}
        keepBridgingImagesValue={keepBridgingImagesValue}
        setKeepBridgingImages={setKeepBridgingImages}
        showResolutionToggle={showResolutionToggle}
        useInputVideoResolution={useInputVideoResolution}
        setUseInputVideoResolution={setUseInputVideoResolution}
        showFpsToggle={showFpsToggle}
        useInputVideoFps={useInputVideoFps}
        setUseInputVideoFps={setUseInputVideoFps}
        noisedInputVideo={noisedInputVideo}
        setNoisedInputVideo={setNoisedInputVideo}
        maxGapFrames={maxGapFrames}
        maxContextFrames={maxContextFrames}
        handleContextFramesChange={handleContextFramesChange}
        sliderNumber={sliderNumber}
        clipPairs={clipPairs}
        shortestClipFrames={shortestClipFrames}
        minClipFramesRequired={minClipFramesRequired}
        actualTotal={actualTotal}
        quantizedTotal={quantizedTotal}
        onRestoreDefaults={onRestoreDefaults}
      />

      {showGenerateButton && (
        <>
          <div className="h-px bg-border/50" />
          <JoinClipsGenerateButton
            onGenerate={onGenerate}
            isGenerating={isGenerating}
            generateSuccess={generateSuccess}
            generateButtonText={generateButtonText}
            isGenerateDisabled={isGenerateDisabled}
          />
        </>
      )}
    </div>
  );
};
