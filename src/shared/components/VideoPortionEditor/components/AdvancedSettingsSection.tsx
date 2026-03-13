import { Label } from '@/shared/components/ui/primitives/label';
import { Slider } from '@/shared/components/ui/slider';
import { Textarea } from '@/shared/components/ui/textarea';
import { MotionPresetSelector } from '@/shared/components/MotionPresetSelector';
import { LoraManager } from '@/domains/lora/components';
import { TOOL_IDS } from '@/shared/lib/tooling/toolIds';
import type {
  VideoPortionEditorLoraProps,
  VideoPortionEditorMotionProps,
} from '@/shared/components/VideoPortionEditor/types';
import { BUILTIN_VACE_PRESET, VACE_FEATURED_PRESET_IDS } from '@/shared/lib/vaceDefaults';

interface AdvancedSettingsSectionProps {
  contextFrames: number;
  maxContextFrames?: number;
  onContextFramesChange: (value: number) => void;
  negativePrompt: string;
  setNegativePrompt: (value: string) => void;
  lora: VideoPortionEditorLoraProps;
  motion: VideoPortionEditorMotionProps;
}

export function AdvancedSettingsSection({
  contextFrames,
  maxContextFrames,
  onContextFramesChange,
  negativePrompt,
  setNegativePrompt,
  lora,
  motion,
}: AdvancedSettingsSectionProps) {
  const {
    availableLoras,
    projectId,
    loraManager,
  } = lora;
  const {
    selectedPhasePresetId,
    phaseConfig,
    motionMode,
    onPhasePresetSelect,
    onPhasePresetRemove,
    onMotionModeChange,
    onPhaseConfigChange,
    randomSeed,
    onRandomSeedChange,
  } = motion;

  return (
    <div className="space-y-4 pt-2">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="context-frames" className="text-sm">
            Context Frames:
          </Label>
          <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
            {contextFrames}
          </span>
        </div>
        <Slider
          id="context-frames"
          min={4}
          max={
            maxContextFrames !== undefined
              ? Math.min(30, maxContextFrames)
              : 30
          }
          step={1}
          value={contextFrames}
          onValueChange={(value) =>
            onContextFramesChange(Array.isArray(value) ? value[0] : value)
          }
        />
        <p className="text-xs text-muted-foreground">
          Frames from preserved sections used for context on each side of edits
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="negative-prompt">Negative Prompt:</Label>
        <Textarea
          id="negative-prompt"
          value={negativePrompt}
          onChange={(event) => setNegativePrompt(event.target.value)}
          placeholder="What to avoid (optional)"
          rows={2}
          className="resize-none"
          clearable
          onClear={() => setNegativePrompt('')}
          voiceInput
          voiceContext="This is a negative prompt - things to AVOID in video regeneration. List unwanted qualities like 'blurry, distorted, low quality, flickering'. Keep it as a comma-separated list of terms to avoid."
          onVoiceResult={(result) => {
            setNegativePrompt(result.prompt || result.transcription);
          }}
        />
      </div>

      <MotionPresetSelector
        builtinPreset={BUILTIN_VACE_PRESET}
        featuredPresetIds={VACE_FEATURED_PRESET_IDS}
        generationTypeMode="vace"
        selectedPhasePresetId={selectedPhasePresetId}
        phaseConfig={phaseConfig}
        motionMode={motionMode}
        onPresetSelect={onPhasePresetSelect}
        onPresetRemove={onPhasePresetRemove}
        onModeChange={onMotionModeChange}
        onPhaseConfigChange={onPhaseConfigChange}
        availableLoras={availableLoras}
        randomSeed={randomSeed}
        onRandomSeedChange={onRandomSeedChange}
        queryKeyPrefix="edit-video-presets"
        renderBasicModeContent={() => (
          <LoraManager
            availableLoras={availableLoras}
            projectId={projectId || undefined}
            persistenceScope="project"
            enableProjectPersistence={true}
            persistenceKey={TOOL_IDS.EDIT_VIDEO}
            externalLoraManager={loraManager}
            title="Additional LoRA Models (Optional)"
            addButtonText="Add or manage LoRAs"
          />
        )}
      />
    </div>
  );
}
