/**
 * PromptSection Component
 *
 * The prompt input area with:
 * - Label with enhanced/default badges and field controls
 * - Textarea with clearable and voice input
 * - Enhance prompt toggle and make-primary variant switch
 */

import React from 'react';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/primitives/label';
import { Switch } from '@/shared/components/ui/switch';
import { FieldDefaultControls } from './FieldDefaultControls';
import { EnhancedPromptBadge } from './EnhancedPromptBadge';
import type { usePromptFieldState } from '@/shared/hooks/usePromptFieldState';
import type { SegmentSettings } from '../types';

interface PromptSectionProps {
  promptField: ReturnType<typeof usePromptFieldState>;
  isRegeneration: boolean;
  settings: SegmentSettings;
  onChange: (updates: Partial<SegmentSettings>) => void;

  // Enhanced prompt
  basePromptForEnhancement?: string;
  enhancePromptEnabled?: boolean;
  onEnhancePromptChange?: (enabled: boolean) => void;

  // Default controls
  onSaveFieldAsDefault?: (field: keyof SegmentSettings, value: SegmentSettings[keyof SegmentSettings]) => Promise<boolean>;
  handleSaveFieldAsDefault: (field: keyof SegmentSettings, value: SegmentSettings[keyof SegmentSettings]) => Promise<void>;
  savingField: string | null;
}

export const PromptSection: React.FC<PromptSectionProps> = ({
  promptField,
  isRegeneration,
  settings,
  onChange,
  basePromptForEnhancement,
  enhancePromptEnabled,
  onEnhancePromptChange,
  onSaveFieldAsDefault,
  handleSaveFieldAsDefault,
  savingField,
}) => {
  return (
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
          <div className="flex items-center gap-x-2 p-2 bg-muted/30 rounded-lg border flex-1">
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
        <div className="flex items-center gap-x-2 p-2 bg-muted/30 rounded-lg border flex-1">
          <Switch
            id="make-primary-segment"
            checked={settings.makePrimaryVariant}
            onCheckedChange={(value) => onChange({ makePrimaryVariant: value })}
          />
          <Label htmlFor="make-primary-segment" className="text-sm font-medium cursor-pointer flex-1">
            Make Primary
          </Label>
        </div>
      </div>
    </div>
  );
};
