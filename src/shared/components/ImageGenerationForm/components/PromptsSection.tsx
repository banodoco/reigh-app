import React, { useCallback } from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Trash2, Wand2, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/shared/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { SegmentedControl, SegmentedControlItem } from "@/shared/components/ui/segmented-control";
import { CollapsibleSection } from "@/shared/components/ui/collapsible-section";
import { PromptMode } from "../types";
import { SectionHeader } from "./SectionHeader";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import {
  useFormUIContext,
  useFormCoreContext,
  useFormPromptsContext,
} from "../ImageGenerationFormContext";

interface PromptsSectionProps {
  /** Handler for prompt mode changes - includes side effects like adjusting imagesPerPrompt */
  onPromptModeChange: (mode: PromptMode) => void;
}

export const PromptsSection: React.FC<PromptsSectionProps> = ({
  onPromptModeChange,
}) => {
  // Pull from context
  const { uiActions } = useFormUIContext();
  const { isGenerating, hasApiKey, ready } = useFormCoreContext();
  const {
    prompts,
    masterPromptText,
    effectivePromptMode: promptMode,
    actionablePromptsCount,
    currentBeforePromptText: beforeEachPromptText,
    currentAfterPromptText: afterEachPromptText,
    setMasterPromptText,
    setCurrentBeforePromptText,
    setCurrentAfterPromptText,
    handleDeleteAllPrompts,
    markAsInteracted,
  } = useFormPromptsContext();

  // Derived handlers
  const onMasterPromptTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMasterPromptText(e.target.value);
  }, [setMasterPromptText]);

  const onBeforeEachPromptTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentBeforePromptText(e.target.value);
  }, [setCurrentBeforePromptText]);

  const onAfterEachPromptTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCurrentAfterPromptText(e.target.value);
  }, [setCurrentAfterPromptText]);

  const onClearMasterPromptText = useCallback(() => {
    markAsInteracted();
    setMasterPromptText('');
  }, [markAsInteracted, setMasterPromptText]);

  const onClearBeforeEachPromptText = useCallback(() => {
    markAsInteracted();
    setCurrentBeforePromptText('');
  }, [markAsInteracted, setCurrentBeforePromptText]);

  const onClearAfterEachPromptText = useCallback(() => {
    markAsInteracted();
    setCurrentAfterPromptText('');
  }, [markAsInteracted, setCurrentAfterPromptText]);

  const onOpenPromptModal = useCallback(() => {
    uiActions.setPromptModalOpen(true);
  }, [uiActions]);

  const onOpenMagicPrompt = useCallback(() => {
    uiActions.openMagicPrompt();
  }, [uiActions]);
  const isMobile = useIsMobile();
  
  // Normalize promptMode to handle invalid/empty values from persistence
  // If promptMode is null, undefined, or empty string, default to 'automated'
  const normalizedPromptMode: PromptMode = 
    (promptMode === 'automated' || promptMode === 'managed') ? promptMode : 'automated';
  
  return (
    <div className="space-y-4">
      {/* Header section - stacks on mobile */}
      <div className={`flex ${isMobile ? 'flex-col gap-3' : 'flex-row justify-between items-center'} mb-2`}>
        <div className="flex items-center gap-2">
          <SectionHeader title="Prompts" theme="orange" />
        </div>
        <div className="flex items-center space-x-2">
          {/* Automated vs Managed Toggle */}
          <SegmentedControl
            value={normalizedPromptMode}
            onValueChange={(value) => onPromptModeChange(value as PromptMode)}
            size="sm"
          >
            <SegmentedControlItem value="automated">
              Automated
            </SegmentedControlItem>
            <SegmentedControlItem value="managed">
              Managed{prompts.length > 0 ? ` (${prompts.length})` : ''}
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
      </div>

      {/* Prompt display area - differs by mode */}
      {normalizedPromptMode === 'automated' ? (
        // Automated mode: Master prompt field
        <div className="mt-2">
          <div className="relative">
            <Label htmlFor="masterPromptText" className="text-sm font-light block mb-1.5">
              Master Prompt:
            </Label>
            {isMobile ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button 
                    type="button" 
                    className="absolute top-0 right-0 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 p-0"
                  >
                    <Info className="h-4 w-4" />
                    <span className="sr-only">Info</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 text-sm" side="left" align="start">
                  <p>
                    AI will generate multiple prompt variations based on this description
                  </p>
                </PopoverContent>
              </Popover>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                      <Info className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      AI will generate multiple prompt variations based on this description
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <Textarea
            id="masterPromptText"
            value={masterPromptText}
            onChange={onMasterPromptTextChange}
            placeholder="Describe what you want to generate..."
            disabled={!hasApiKey || isGenerating || !ready}
            className="min-h-[100px] resize-none"
            rows={4}
            clearable
            onClear={onClearMasterPromptText}
            voiceInput
            voiceContext="This is a master prompt for AI image generation. The user describes what they want to generate, and AI will create multiple prompt variations from this description. Focus on capturing the visual concept, style, and key elements they want."
            voiceExample="Different images of a woman going about her day - waking up in the morning light, having coffee at a cafe, walking through a busy city street, reading in a park, cooking dinner at home. Warm, cinematic lighting with a nostalgic film photography aesthetic."
            onVoiceResult={(result) => {
              const text = result.prompt || result.transcription;
              onMasterPromptTextChange({ target: { value: text } } as React.ChangeEvent<HTMLTextAreaElement>);
            }}
          />
        </div>
      ) : (
        // Managed mode: Always show summary box
        <div className="space-y-3">
          {!ready ? (
            // Simple skeleton loading state
            <div>
              <div className="p-3 rounded-md shadow-sm bg-slate-50/30 dark:bg-slate-800/30">
                <div className="min-h-[60px] bg-muted rounded animate-pulse"></div>
              </div>
            </div>
          ) : (
            <div 
              className="mt-2 group relative p-3 border rounded-md text-center bg-muted/50 hover:border-primary/50 cursor-pointer flex items-center justify-center min-h-[60px]" 
              onClick={isMobile ? onOpenPromptModal : onOpenPromptModal}
            >
              {prompts.length === 1 && actionablePromptsCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Click to add prompts...
                </p>
              ) : actionablePromptsCount === prompts.length ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-light text-primary">{prompts.length} {prompts.length === 1 ? 'prompt' : 'prompts'}</span> currently active.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {prompts.length} {prompts.length === 1 ? 'prompt' : 'prompts'}, <span className="font-light text-primary">{actionablePromptsCount} currently active</span>
                </p>
              )}
              {/* Action buttons container - right side */}
              <div className={`absolute top-1 right-1 flex items-center gap-1 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                {/* Magic wand button */}
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMagicPrompt();
                        }}
                        disabled={isGenerating || !ready || !hasApiKey}
                        aria-label="AI Prompt Tools"
                        className="h-6 w-6 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-100 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-900/20"
                      >
                        <Wand2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      AI Prompt Tools
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {/* Delete All button - hide when there's only one empty prompt */}
                {handleDeleteAllPrompts && !(prompts.length === 1 && actionablePromptsCount === 0) && (
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAllPrompts();
                          }}
                          disabled={isGenerating || !ready}
                          aria-label="Delete all prompts"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Delete all and reset to one empty prompt
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Additional prompt settings (Before / After prompt modifiers) */}
      <CollapsibleSection title="Additional prompt settings">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="beforeEachPromptText">
              Before each prompt:
            </Label>
            <Textarea
              id="beforeEachPromptText"
              value={beforeEachPromptText}
              onChange={onBeforeEachPromptTextChange}
              placeholder="Text to prepend"
              disabled={!hasApiKey || isGenerating}
              className="mt-1 h-16 resize-none"
              rows={2}
              clearable
              onClear={onClearBeforeEachPromptText}
              voiceInput
              voiceContext="This is text that will be prepended to every image generation prompt. Keep it short - things like style prefixes, quality tags, or subject descriptions that apply to all images."
              onVoiceResult={(result) => {
                const text = result.prompt || result.transcription;
                onBeforeEachPromptTextChange({ target: { value: text } } as React.ChangeEvent<HTMLTextAreaElement>);
              }}
            />
          </div>
          <div>
            <Label htmlFor="afterEachPromptText">
              After each prompt:
            </Label>
            <Textarea
              id="afterEachPromptText"
              value={afterEachPromptText}
              onChange={onAfterEachPromptTextChange}
              placeholder="Text to append"
              disabled={!hasApiKey || isGenerating}
              className="mt-1 h-16 resize-none"
              rows={2}
              clearable
              onClear={onClearAfterEachPromptText}
              voiceInput
              voiceContext="This is text that will be appended to every image generation prompt. Keep it short - things like quality suffixes, negative prompts, or technical parameters that apply to all images."
              onVoiceResult={(result) => {
                const text = result.prompt || result.transcription;
                onAfterEachPromptTextChange({ target: { value: text } } as React.ChangeEvent<HTMLTextAreaElement>);
              }}
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};
