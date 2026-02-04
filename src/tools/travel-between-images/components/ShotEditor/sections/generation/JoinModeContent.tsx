/**
 * JoinModeContent - Join Segments mode UI
 *
 * Renders the JoinClipsSettingsForm and swap button for Join Segments mode.
 * Pulls data from ShotSettingsContext - only receives refs as props.
 */

import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { JoinClipsSettingsForm, DEFAULT_JOIN_CLIPS_PHASE_CONFIG, BUILTIN_JOIN_CLIPS_DEFAULT_ID } from '@/tools/join-clips/components/JoinClipsSettingsForm';
import {
  useShotCore,
  useShotLoras,
  useGenerationMode,
  useJoinState,
} from '../../ShotSettingsContext';

export interface JoinModeContentProps {
  // Refs - must be passed from parent for DOM positioning
  joinSegmentsSectionRef: React.RefObject<HTMLDivElement>;
  swapButtonRef: React.RefObject<HTMLButtonElement>;
}

export const JoinModeContent: React.FC<JoinModeContentProps> = ({
  joinSegmentsSectionRef,
  swapButtonRef,
}) => {
  // Pull from ShotSettingsContext
  const { projectId } = useShotCore();
  const { availableLoras } = useShotLoras();
  const generationMode = useGenerationMode();
  const joinState = useJoinState();

  // Extract join settings
  const {
    prompt: joinPrompt = '',
    negativePrompt: joinNegativePrompt = '',
    contextFrameCount: joinContextFrames = 15,
    gapFrameCount: joinGapFrames = 23,
    replaceMode: joinReplaceMode = true,
    keepBridgingImages: joinKeepBridgingImages = false,
    enhancePrompt: joinEnhancePrompt = false,
    motionMode: joinMotionMode = 'basic',
    phaseConfig: joinPhaseConfig,
    selectedPhasePresetId: joinSelectedPhasePresetId,
    randomSeed: joinRandomSeed = false,
  } = joinState.joinSettings.settings || {};

  return (
    <div ref={joinSegmentsSectionRef}>
      <JoinClipsSettingsForm
        gapFrames={joinGapFrames}
        setGapFrames={(val) => joinState.joinSettings.updateField('gapFrameCount', val)}
        contextFrames={joinContextFrames}
        setContextFrames={(val) => joinState.joinSettings.updateField('contextFrameCount', val)}
        replaceMode={joinReplaceMode}
        setReplaceMode={(val) => joinState.joinSettings.updateField('replaceMode', val)}
        keepBridgingImages={joinKeepBridgingImages}
        setKeepBridgingImages={(val) => joinState.joinSettings.updateField('keepBridgingImages', val)}
        prompt={joinPrompt}
        setPrompt={(val) => joinState.joinSettings.updateField('prompt', val)}
        negativePrompt={joinNegativePrompt}
        setNegativePrompt={(val) => joinState.joinSettings.updateField('negativePrompt', val)}
        enhancePrompt={joinEnhancePrompt}
        setEnhancePrompt={(val) => joinState.joinSettings.updateField('enhancePrompt', val)}
        availableLoras={availableLoras}
        projectId={projectId}
        loraPersistenceKey="join-clips-shot-editor"
        loraManager={joinState.joinLoraManager}
        onGenerate={joinState.handleJoinSegments}
        isGenerating={joinState.isJoiningClips}
        generateSuccess={joinState.joinClipsSuccess}
        generateButtonText="Join Segments"
        isGenerateDisabled={joinState.joinValidationData.videoCount < 2}
        onRestoreDefaults={joinState.handleRestoreJoinDefaults}
        shortestClipFrames={joinState.joinValidationData.shortestClipFrames}
        motionMode={joinMotionMode}
        onMotionModeChange={(mode) => joinState.joinSettings.updateField('motionMode', mode)}
        phaseConfig={joinPhaseConfig ?? DEFAULT_JOIN_CLIPS_PHASE_CONFIG}
        onPhaseConfigChange={(config) => joinState.joinSettings.updateField('phaseConfig', config)}
        randomSeed={joinRandomSeed}
        onRandomSeedChange={(val) => joinState.joinSettings.updateField('randomSeed', val)}
        selectedPhasePresetId={joinSelectedPhasePresetId ?? BUILTIN_JOIN_CLIPS_DEFAULT_ID}
        onPhasePresetSelect={(presetId, config) => {
          joinState.joinSettings.updateFields({
            selectedPhasePresetId: presetId,
            phaseConfig: config,
          });
        }}
        onPhasePresetRemove={() => {
          joinState.joinSettings.updateField('selectedPhasePresetId', null);
        }}
      />

      {/* Swap to Batch Generate */}
      <button
        ref={swapButtonRef}
        onClick={() => generationMode.toggleGenerateModePreserveScroll('batch')}
        className="mt-4 w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
      >
        <ArrowLeftRight className="w-4 h-4" />
        <span>Swap to Batch Generate</span>
      </button>
    </div>
  );
};
