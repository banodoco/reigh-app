import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/primitives/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Trash2, Wand2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { SegmentedControl, SegmentedControlItem } from "@/shared/components/ui/segmented-control";
import { CollapsibleSection } from "@/shared/components/ui/collapsible-section";
import { ResponsiveInfoTip } from "@/shared/components/ui/responsive-info-tip";
import { PromptMode } from "../types";
import { SectionHeader } from "./SectionHeader";
import { usePromptsSectionController } from "./prompts-section/usePromptsSectionController";

interface PromptsSectionProps {
  /** Handler for prompt mode changes - includes side effects like adjusting imagesPerPrompt */
  onPromptModeChange: (mode: PromptMode) => void;
}

export const PromptsSection: React.FC<PromptsSectionProps> = ({
  onPromptModeChange,
}) => {
  const controller = usePromptsSectionController();
  
  return (
    <div className="space-y-4">
      {/* Header section - stacks on mobile */}
      <div className={`flex ${controller.isMobile ? 'flex-col gap-3' : 'flex-row justify-between items-center'} mb-2`}>
        <div className="flex items-center gap-2">
          <SectionHeader title="Prompts" theme="orange" />
        </div>
        <div className="flex items-center gap-x-2">
          {/* Automated vs Managed Toggle */}
          <SegmentedControl
            value={controller.normalizedPromptMode}
            onValueChange={(value) => onPromptModeChange(value as PromptMode)}
            size="sm"
          >
            <SegmentedControlItem value="automated">
              Automated
            </SegmentedControlItem>
            <SegmentedControlItem value="managed">
              Managed{controller.prompts.length > 0 ? ` (${controller.prompts.length})` : ''}
            </SegmentedControlItem>
          </SegmentedControl>
        </div>
      </div>

      {/* Prompt display area - differs by mode */}
      {controller.normalizedPromptMode === 'automated' ? (
        // Automated mode: Master prompt field
        <div className="mt-2">
          <div className="relative">
            <Label htmlFor="masterPromptText" className="text-sm font-light block mb-1.5">
              Master Prompt:
            </Label>
            <ResponsiveInfoTip
              isMobile={controller.isMobile}
              content={(
                <p>
                  AI will generate multiple prompt variations based on this description
                </p>
              )}
            />
          </div>
            <Textarea
              id="masterPromptText"
              value={controller.masterPromptText}
              onChange={controller.onMasterPromptTextChange}
              placeholder="Describe what you want to generate..."
              disabled={controller.isGenerating || !controller.ready}
              className="min-h-[100px] resize-none"
              rows={4}
              clearable
              onClear={controller.onClearMasterPromptText}
              voiceInput
              voiceContext="This is a master prompt for AI image generation. The user describes what they want to generate, and AI will create multiple prompt variations from this description. Focus on capturing the visual concept, style, and key elements they want."
              voiceExample="Different images of a woman going about her day - waking up in the morning light, having coffee at a cafe, walking through a busy city street, reading in a park, cooking dinner at home. Warm, cinematic lighting with a nostalgic film photography aesthetic."
              onVoiceResult={controller.onMasterVoiceResult}
            />
          </div>
      ) : (
        // Managed mode: Always show summary box
        <div className="space-y-3">
          {!controller.ready ? (
            // Simple skeleton loading state
            <div>
              <div className="p-3 rounded-md shadow-sm bg-slate-50/30 dark:bg-slate-800/30">
                <div className="min-h-[60px] bg-muted rounded animate-pulse"></div>
              </div>
            </div>
          ) : (
              <div 
                className="mt-2 group relative p-3 border rounded-md text-center bg-muted/50 hover:border-primary/50 cursor-pointer flex items-center justify-center min-h-[60px]" 
              onClick={controller.onOpenPromptModal}
            >
              {controller.prompts.length === 1 && controller.actionablePromptsCount === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Click to add prompts...
                </p>
              ) : controller.actionablePromptsCount === controller.prompts.length ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-light text-primary">{controller.prompts.length} {controller.prompts.length === 1 ? 'prompt' : 'prompts'}</span> currently active.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {controller.prompts.length} {controller.prompts.length === 1 ? 'prompt' : 'prompts'}, <span className="font-light text-primary">{controller.actionablePromptsCount} currently active</span>
                </p>
              )}
              {/* Action buttons container - right side */}
              <div className={`absolute top-1 right-1 flex items-center gap-1 ${controller.isMobile ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
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
                          controller.onOpenMagicPrompt();
                        }}
                        disabled={controller.isGenerating || !controller.ready}
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
                {controller.handleDeleteAllPrompts && !(controller.prompts.length === 1 && controller.actionablePromptsCount === 0) && (
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            controller.handleDeleteAllPrompts();
                          }}
                          disabled={controller.isGenerating || !controller.ready}
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
              value={controller.beforeEachPromptText}
              onChange={controller.onBeforeEachPromptTextChange}
              placeholder="Text to prepend"
              disabled={controller.isGenerating}
              className="mt-1 h-16 resize-none"
              rows={2}
              clearable
              onClear={controller.onClearBeforeEachPromptText}
              voiceInput
              voiceContext="This is text that will be prepended to every image generation prompt. Keep it short - things like style prefixes, quality tags, or subject descriptions that apply to all images."
              onVoiceResult={controller.onBeforeVoiceResult}
            />
          </div>
          <div>
            <Label htmlFor="afterEachPromptText">
              After each prompt:
            </Label>
            <Textarea
              id="afterEachPromptText"
              value={controller.afterEachPromptText}
              onChange={controller.onAfterEachPromptTextChange}
              placeholder="Text to append"
              disabled={controller.isGenerating}
              className="mt-1 h-16 resize-none"
              rows={2}
              clearable
              onClear={controller.onClearAfterEachPromptText}
              voiceInput
              voiceContext="This is text that will be appended to every image generation prompt. Keep it short - things like quality suffixes, negative prompts, or technical parameters that apply to all images."
              onVoiceResult={controller.onAfterVoiceResult}
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};
