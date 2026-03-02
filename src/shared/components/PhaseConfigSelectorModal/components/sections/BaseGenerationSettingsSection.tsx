import React from 'react';
import { Label } from '@/shared/components/ui/primitives/label';
import { Input } from '@/shared/components/ui/input';
import { Textarea } from '@/shared/components/ui/textarea';
import { Switch } from '@/shared/components/ui/switch';
import { Slider } from '@/shared/components/ui/slider';
import { framesToSecondsValue } from '@/shared/lib/media/videoUtils';

interface BaseGenerationSettingsSectionProps {
  basePrompt: string;
  negativePrompt: string;
  textBeforePrompts: string;
  textAfterPrompts: string;
  enhancePrompt: boolean;
  durationFrames: number;
  onBasePromptChange: (value: string) => void;
  onNegativePromptChange: (value: string) => void;
  onTextBeforePromptsChange: (value: string) => void;
  onTextAfterPromptsChange: (value: string) => void;
  onEnhancePromptChange: (value: boolean) => void;
  onDurationFramesChange: (value: number) => void;
}

export const BaseGenerationSettingsSection: React.FC<BaseGenerationSettingsSectionProps> = ({
  basePrompt,
  negativePrompt,
  textBeforePrompts,
  textAfterPrompts,
  enhancePrompt,
  durationFrames,
  onBasePromptChange,
  onNegativePromptChange,
  onTextBeforePromptsChange,
  onTextAfterPromptsChange,
  onEnhancePromptChange,
  onDurationFramesChange,
}) => {
  return (
    <div className="space-y-3 pt-2 border-t">
      <Label className="text-base font-semibold">Base Generation Settings</Label>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="preset-base-prompt">Base Prompt:</Label>
          <Textarea
            id="preset-base-prompt"
            placeholder="Enter the main prompt for this preset..."
            value={basePrompt}
            onChange={e => onBasePromptChange(e.target.value)}
            rows={3}
            clearable
            onClear={() => onBasePromptChange('')}
            voiceInput
            voiceContext="This is a base prompt for video generation preset. Describe the visual style, motion, or effect that should be applied by default when using this preset."
            onVoiceResult={(result) => {
              onBasePromptChange(result.prompt || result.transcription);
            }}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="preset-negative-prompt">Negative Prompt:</Label>
          <Textarea
            id="preset-negative-prompt"
            placeholder="Enter negative prompt..."
            value={negativePrompt}
            onChange={e => onNegativePromptChange(e.target.value)}
            rows={3}
            clearable
            onClear={() => onNegativePromptChange('')}
            voiceInput
            voiceContext="This is a negative prompt for a video preset - things to AVOID. List unwanted qualities as a comma-separated list."
            onVoiceResult={(result) => {
              onNegativePromptChange(result.prompt || result.transcription);
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-x-2 p-3 bg-muted/30 rounded-lg border">
        <Switch
          id="preset-enhance"
          checked={enhancePrompt}
          onCheckedChange={onEnhancePromptChange}
        />
        <div className="flex-1">
          <Label htmlFor="preset-enhance" className="font-medium">
            Enhance/Create Prompts
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="preset-text-before">Text Before Prompts:</Label>
          <Input
            id="preset-text-before"
            placeholder="Prefix text..."
            value={textBeforePrompts}
            onChange={e => onTextBeforePromptsChange(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="preset-text-after">Text After Prompts:</Label>
          <Input
            id="preset-text-after"
            placeholder="Suffix text..."
            value={textAfterPrompts}
            onChange={e => onTextAfterPromptsChange(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="preset-duration">Suggested duration:</Label>
        <div className="flex items-center gap-3">
          <Slider
            id="preset-duration"
            min={10}
            max={81}
            step={1}
            value={durationFrames}
            onValueChange={(value) => {
              const nextValue = Array.isArray(value) ? (value[0] ?? durationFrames) : value;
              onDurationFramesChange(nextValue);
            }}
            className="flex-1"
          />
          <span className="text-sm font-medium w-16 text-right">
            {durationFrames} ({framesToSecondsValue(durationFrames).toFixed(1)}s)
          </span>
        </div>
      </div>
    </div>
  );
};
