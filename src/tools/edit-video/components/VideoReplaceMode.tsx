/**
 * VideoReplaceMode - Re-exports + remaining components (ReplaceTimeline, ReplacePanelContent).
 *
 * Extracted to separate files:
 * - useReplaceMode → ../hooks/useReplaceMode.ts
 * - ReplaceVideoOverlay → ./ReplaceVideoOverlay.tsx
 */

import type { RefObject } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Plus } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { VideoPortionEditor } from '@/shared/components/VideoPortionEditor';
import { MultiPortionTimeline, type PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { DEFAULT_VACE_PHASE_CONFIG, BUILTIN_VACE_DEFAULT_ID } from '@/shared/lib/vaceDefaults';

// Re-exports for backward compatibility
export { useReplaceMode } from '../hooks/useReplaceMode';
export { ReplaceVideoOverlay } from './ReplaceVideoOverlay';

/**
 * Timeline section rendered below the video in replace mode.
 */
export function ReplaceTimeline({
  videoDuration,
  selections,
  activeSelectionId,
  onSelectionChange,
  onSelectionClick,
  onRemoveSelection,
  onAddSelection,
  videoRef,
  videoUrl,
  videoFps,
  contextFrameCount,
  useStackedLayout,
}: {
  videoDuration: number;
  selections: PortionSelection[];
  activeSelectionId: string | null;
  onSelectionChange: (id: string, start: number, end: number) => void;
  onSelectionClick: (id: string | null) => void;
  onRemoveSelection: (id: string) => void;
  onAddSelection: () => void;
  videoRef: RefObject<HTMLVideoElement>;
  videoUrl: string | null | undefined;
  videoFps: number | null;
  contextFrameCount: number;
  useStackedLayout: boolean;
}) {
  if (videoDuration <= 0) return null;

  return (
    <div className={cn(
      "bg-zinc-900 select-none touch-manipulation flex-shrink-0",
      useStackedLayout ? "px-3 py-2" : "px-4 pt-2 pb-2 rounded-b-lg"
    )}>
      {/* Timeline */}
      <MultiPortionTimeline
        duration={videoDuration}
        selections={selections}
        activeSelectionId={activeSelectionId}
        onSelectionChange={onSelectionChange}
        onSelectionClick={onSelectionClick}
        onRemoveSelection={onRemoveSelection}
        videoRef={videoRef}
        videoUrl={videoUrl ?? ''}
        fps={videoFps}
        maxGapFrames={Math.max(1, 81 - (contextFrameCount * 2))}
      />

      {/* Add button */}
      <div className="flex justify-center -mt-3 pb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddSelection}
          className="text-white/70 hover:text-white hover:bg-white/10 gap-1 text-xs h-6 px-2"
        >
          <Plus className="w-3 h-3" />
          Add selection
        </Button>
      </div>
    </div>
  );
}

/**
 * Panel content for replace mode (wraps VideoPortionEditor with all its props).
 */
export function ReplacePanelContent({
  replaceState,
  videoUrl,
  videoFps,
  selectedProjectId,
}: {
  replaceState: ReturnType<typeof import('../hooks/useReplaceMode').useReplaceMode>;
  videoUrl: string | null | undefined;
  videoFps: number | null;
  selectedProjectId: string | null;
}) {
  const {
    selections,
    handleUpdateSelectionSettings,
    handleRemoveSelection,
    handleAddSelection,
    maxContextFrames,
    editSettings,
    loraManager,
    availableLoras,
    handleGenerate,
    isGenerating,
    showSuccessState,
    isValidPortion,
    portionValidation,
    contextFrameCount,
    gapFrameCount,
    negativePrompt,
    enhancePrompt,
    motionMode,
    savedPhaseConfig,
    randomSeed,
    selectedPhasePresetId,
  } = replaceState;

  return (
    <VideoPortionEditor
      gapFrames={gapFrameCount}
      setGapFrames={(val) => editSettings.updateField('gapFrameCount', val)}
      contextFrames={contextFrameCount}
      setContextFrames={(val) => {
        const maxGap = Math.max(1, 81 - (val * 2));
        const newGapFrames = gapFrameCount > maxGap ? maxGap : gapFrameCount;
        editSettings.updateFields({
          contextFrameCount: val,
          gapFrameCount: newGapFrames
        });
      }}
      maxContextFrames={maxContextFrames}
      negativePrompt={negativePrompt}
      setNegativePrompt={(val) => editSettings.updateField('negativePrompt', val)}
      enhancePrompt={enhancePrompt}
      setEnhancePrompt={(val) => editSettings.updateField('enhancePrompt', val)}
      selections={selections}
      onUpdateSelectionSettings={handleUpdateSelectionSettings}
      onRemoveSelection={handleRemoveSelection}
      onAddSelection={handleAddSelection}
      videoUrl={videoUrl ?? ''}
      fps={videoFps}
      availableLoras={availableLoras}
      projectId={selectedProjectId ?? null}
      loraManager={loraManager}
      // Motion settings
      motionMode={motionMode as 'basic' | 'advanced'}
      onMotionModeChange={(mode) => editSettings.updateField('motionMode', mode)}
      phaseConfig={savedPhaseConfig ?? DEFAULT_VACE_PHASE_CONFIG}
      onPhaseConfigChange={(config) => editSettings.updateField('phaseConfig', config)}
      randomSeed={randomSeed}
      onRandomSeedChange={(val) => editSettings.updateField('randomSeed', val)}
      selectedPhasePresetId={selectedPhasePresetId ?? BUILTIN_VACE_DEFAULT_ID}
      onPhasePresetSelect={(presetId, config) => {
        editSettings.updateFields({
          selectedPhasePresetId: presetId,
          phaseConfig: config,
        });
      }}
      onPhasePresetRemove={() => {
        editSettings.updateField('selectedPhasePresetId', null);
      }}
      // Actions
      onGenerate={handleGenerate}
      isGenerating={isGenerating}
      generateSuccess={showSuccessState}
      isGenerateDisabled={!isValidPortion}
      validationErrors={portionValidation.errors}
    />
  );
}
