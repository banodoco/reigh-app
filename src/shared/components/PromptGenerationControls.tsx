import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Slider } from '@/shared/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { GeneratePromptsParams, AIPromptItem } from '@/types/ai';
import { ChevronDown, ChevronRight, Settings, Zap } from 'lucide-react';
import { useGenerationControlsState } from './PromptGenerationControls/hooks/useGenerationControlsState';
import { AdvancedOptionsPanel } from './PromptGenerationControls/components/AdvancedOptionsPanel';
import { temperatureOptions, type GenerationControlValues } from './PromptGenerationControls/constants';

export type { GenerationControlValues };
;

interface PromptGenerationControlsProps {
  onGenerate: (params: GeneratePromptsParams) => Promise<void>;
  onGenerateAndQueue?: (params: GeneratePromptsParams) => Promise<void>;
  isGenerating: boolean;
  hasApiKey?: boolean;
  existingPromptsForContext?: AIPromptItem[];
  initialValues?: Partial<GenerationControlValues>;
  onValuesChange?: (values: GenerationControlValues) => void;
  remixMode?: boolean;
}

export const PromptGenerationControls: React.FC<PromptGenerationControlsProps> = ({
  onGenerate,
  onGenerateAndQueue,
  isGenerating,
  hasApiKey,
  existingPromptsForContext = [],
  initialValues,
  onValuesChange,
  remixMode = false,
}) => {
  const {
    overallPromptText,
    remixPromptText,
    rulesToRememberText,
    numberToGenerate,
    includeExistingContext,
    replaceCurrentPrompts,
    temperature,
    showAdvanced,
    emitChange,
    setOverallPromptText,
    setRemixPromptText,
    setRulesToRememberText,
    setNumberToGenerate,
    setIncludeExistingContext,
    setReplaceCurrentPrompts,
    setTemperatureWithSnap,
    setShowAdvanced,
  } = useGenerationControlsState({
    initialValues,
    onValuesChange,
    remixMode,
  });

  const addSummary = true;

  const buildGenerateParams = (): GeneratePromptsParams => {
    const shouldIncludeExisting = remixMode || includeExistingContext;
    const shouldReplace = remixMode || replaceCurrentPrompts;

    return {
      overallPromptText: remixMode ? remixPromptText : overallPromptText,
      rulesToRememberText,
      numberToGenerate,
      existingPrompts: shouldIncludeExisting ? existingPromptsForContext : undefined,
      addSummaryForNewPrompts: addSummary,
      replaceCurrentPrompts: shouldReplace,
      temperature,
    };
  };

  const handleGenerateClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!hasApiKey) {
      alert('API Key is required to generate prompts.');
      return;
    }
    await onGenerate(buildGenerateParams());
  };

  const handleGenerateAndQueueClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!hasApiKey) {
      alert('API Key is required to generate prompts.');
      return;
    }
    if (!onGenerateAndQueue) {
      return;
    }
    await onGenerateAndQueue(buildGenerateParams());
  };

  return (
    <div className="p-4">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 space-y-2">
          <div>
            <Label htmlFor="gen_overallPromptText" className="mb-2 block">
              {remixMode ? 'How would you like to remix the prompts?' : 'What prompts would you like to generate?'}
            </Label>
            <Textarea
              id="gen_overallPromptText"
              value={remixMode ? remixPromptText : overallPromptText}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (remixMode) {
                  setRemixPromptText(nextValue);
                  emitChange({ remixPromptText: nextValue });
                } else {
                  setOverallPromptText(nextValue);
                  emitChange({ overallPromptText: nextValue });
                }
              }}
              placeholder={remixMode ? 'e.g., Transform into fever dreams...' : 'e.g., A medieval fantasy adventure with dragons and magic...'}
              rows={2}
              disabled={!hasApiKey || isGenerating}
              className="min-h-[60px] max-h-[60px]"
              clearable
              onClear={() => {
                if (remixMode) {
                  setRemixPromptText('');
                  emitChange({ remixPromptText: '' });
                } else {
                  setOverallPromptText('');
                  emitChange({ overallPromptText: '' });
                }
              }}
              voiceInput
              voiceContext={remixMode
                ? 'This is a remix instruction for AI prompt generation. Describe how you want to transform or remix existing prompts - like make them more surreal or transform into horror style. Be creative and descriptive.'
                : 'This is a master prompt for AI image generation. Describe the overall theme, style, or concept you want to generate multiple prompts for. AI will create variations based on this description.'}
              onVoiceResult={(result) => {
                const text = result.prompt || result.transcription;
                if (remixMode) {
                  setRemixPromptText(text);
                  emitChange({ remixPromptText: text });
                } else {
                  setOverallPromptText(text);
                  emitChange({ overallPromptText: text });
                }
              }}
            />
          </div>

          <div className="flex items-start gap-4 w-full sm:w-[400px]">
            <div className="flex-1 sm:flex-none sm:w-[70%]">
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="gen_numberToGenerate" className="text-sm font-medium">
                  Number to Generate
                </Label>
                <span className="text-sm font-medium text-muted-foreground">
                  {numberToGenerate}
                </span>
              </div>
              <Slider
                id="gen_numberToGenerate"
                value={numberToGenerate}
                onValueChange={(value) => {
                  const nextValue = Array.isArray(value) ? (value[0] ?? numberToGenerate) : value;
                  setNumberToGenerate(nextValue);
                  emitChange({ numberToGenerate: nextValue });
                }}
                min={1}
                max={32}
                step={1}
                disabled={!hasApiKey || isGenerating}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1</span>
                <span>32</span>
              </div>
            </div>

            <div className="hidden sm:flex flex-shrink-0 pt-2 w-[30%]">
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex items-center gap-2 text-xs p-2 h-auto justify-center w-full"
                    onClick={() => {
                      const nextValue = !showAdvanced;
                      setShowAdvanced(nextValue);
                      emitChange({ showAdvanced: nextValue });
                    }}
                  >
                    <Settings className="h-3 w-3" />
                    <span className="text-center leading-tight">Advanced<br />Options</span>
                    {showAdvanced ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
          </div>

          <div className="sm:hidden -mt-4">
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="flex items-center gap-2 text-sm p-2 h-auto justify-start"
                  onClick={() => {
                    const nextValue = !showAdvanced;
                    setShowAdvanced(nextValue);
                    emitChange({ showAdvanced: nextValue });
                  }}
                >
                  <Settings className="h-4 w-4" />
                  <span>Advanced Options</span>
                  {showAdvanced ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>

          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleContent>
              <AdvancedOptionsPanel
                isDesktop={false}
                remixMode={remixMode}
                rulesToRememberText={rulesToRememberText}
                onRulesToRememberTextChange={(value) => {
                  setRulesToRememberText(value);
                  emitChange({ rulesToRememberText: value });
                }}
                temperature={temperature}
                onTemperatureChange={setTemperatureWithSnap}
                includeExistingContext={includeExistingContext}
                onIncludeExistingContextChange={(value) => {
                  setIncludeExistingContext(value);
                  emitChange({ includeExistingContext: value });
                }}
                replaceCurrentPrompts={replaceCurrentPrompts}
                onReplaceCurrentPromptsChange={(value) => {
                  setReplaceCurrentPrompts(value);
                  emitChange({ replaceCurrentPrompts: value });
                }}
                hasApiKey={hasApiKey}
                isGenerating={isGenerating}
                existingPromptsCount={existingPromptsForContext.length}
              />
            </CollapsibleContent>
          </Collapsible>

          <div className="w-full sm:w-[300px] space-y-2">
            <Button
              type="button"
              variant="retro"
              size="retro-sm"
              onClick={handleGenerateClick}
              disabled={!hasApiKey || isGenerating}
              className="w-full"
            >
              {isGenerating ? 'Generating...' : 'Generate Prompts'}
            </Button>
            {onGenerateAndQueue && (
              <Button
                type="button"
                variant="retro-secondary"
                size="retro-sm"
                onClick={handleGenerateAndQueueClick}
                disabled={!hasApiKey || isGenerating}
                className="w-full"
              >
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                {isGenerating ? 'Generating...' : 'Generate & Queue Images'}
              </Button>
            )}
          </div>
        </div>

        {showAdvanced && (
          <AdvancedOptionsPanel
            isDesktop
            remixMode={remixMode}
            rulesToRememberText={rulesToRememberText}
            onRulesToRememberTextChange={(value) => {
              setRulesToRememberText(value);
              emitChange({ rulesToRememberText: value });
            }}
            temperature={temperature}
            onTemperatureChange={setTemperatureWithSnap}
            includeExistingContext={includeExistingContext}
            onIncludeExistingContextChange={(value) => {
              setIncludeExistingContext(value);
              emitChange({ includeExistingContext: value });
            }}
            replaceCurrentPrompts={replaceCurrentPrompts}
            onReplaceCurrentPromptsChange={(value) => {
              setReplaceCurrentPrompts(value);
              emitChange({ replaceCurrentPrompts: value });
            }}
            hasApiKey={hasApiKey}
            isGenerating={isGenerating}
            existingPromptsCount={existingPromptsForContext.length}
          />
        )}
      </div>
    </div>
  );
};
