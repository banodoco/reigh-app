import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { type JoinClipsSettingsFormProps, type BoundaryCrossfadeStatus } from './types';
import { JOIN_CLIPS_FEATURED_PRESET_IDS } from './constants';
import { useJoinClipsSettingsController } from './hooks/useJoinClipsSettingsController';
import { JoinClipsGenerateButton } from './components/JoinClipsGenerateButton';
import { JoinClipsMotionSettings } from './components/JoinClipsMotionSettings';
import { JoinClipsPromptSettings } from './components/JoinClipsPromptSettings';
import { JoinClipsStructureSettings } from './components/JoinClipsStructureSettings';

function CrossfadeBanner({ boundaries }: { boundaries: BoundaryCrossfadeStatus[] }) {
  const crossfadeCount = boundaries.filter(b => b.canCrossfade).length;
  const total = boundaries.length;
  const allCrossfade = crossfadeCount === total;

  if (allCrossfade) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
        <p className="text-sm text-foreground">
          All {total} {total === 1 ? 'boundary' : 'boundaries'} have smooth continuation —
          segments will be stitched instantly without GPU processing.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 space-y-1">
      <p className="text-sm text-foreground">
        {crossfadeCount} of {total} {total === 1 ? 'boundary' : 'boundaries'} have smooth continuation and will be stitched instantly.
      </p>
      <p className="text-xs text-muted-foreground">
        The remaining {total - crossfadeCount} {total - crossfadeCount === 1 ? 'boundary requires' : 'boundaries require'} GPU
        generation — configure settings below.
      </p>
    </div>
  );
}

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
    boundarySummary,
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

  const allCrossfade = boundarySummary && boundarySummary.length > 0 &&
    boundarySummary.every(b => b.canCrossfade);

  return (
    <div className={cn('space-y-8', className)}>
      {headerContent && <div className="mb-6">{headerContent}</div>}

      {boundarySummary && boundarySummary.length > 0 && (
        <CrossfadeBanner boundaries={boundarySummary} />
      )}

      {!allCrossfade && (
        <>
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
        </>
      )}

      {!allCrossfade && (
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
      )}

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
