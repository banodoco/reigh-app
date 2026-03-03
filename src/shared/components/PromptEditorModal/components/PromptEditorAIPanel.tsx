import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { Wand2Icon, Edit, ChevronDown, ChevronLeft, Sparkles, Shuffle } from 'lucide-react';
import {
  PromptGenerationControls,
  type GenerationControlValues as PGCGenerationControlValues,
} from '@/shared/components/PromptGenerationControls';
import {
  BulkEditControls,
  type BulkEditParams as BECBulkEditParams,
  type BulkEditControlValues as BECBulkEditControlValues,
} from '@/shared/components/PromptEditorModal/BulkEditControls';
import type { PromptEntry } from '@/shared/components/ImageGenerationForm';
import type { GeneratePromptsParams } from '@/types/ai';

type EditorMode = 'generate' | 'remix' | 'bulk-edit';
type GenerationControlValues = PGCGenerationControlValues;
type BulkEditControlValues = BECBulkEditControlValues;

interface PromptEditorAIPanelProps {
  isMobile: boolean;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
  onToggle: (e: React.MouseEvent | React.TouchEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  activeTab: EditorMode;
  onActiveTabChange: (mode: EditorMode) => void;
  prompts: PromptEntry[];
  generation: {
    onGenerate: (params: GeneratePromptsParams) => Promise<void>;
    onGenerateAndQueue?: (params: GeneratePromptsParams) => Promise<void>;
    isGenerating: boolean;
    values: GenerationControlValues;
    onValuesChange: (values: GenerationControlValues) => void;
  };
  bulkEdit: {
    onBulkEdit: (params: BECBulkEditParams) => Promise<void>;
    isEditing: boolean;
    values: BulkEditControlValues;
    onValuesChange: (values: BulkEditControlValues) => void;
  };
}

export function PromptEditorAIPanel({
  isMobile,
  expanded,
  onExpandedChange,
  onToggle,
  onTouchStart,
  activeTab,
  onActiveTabChange,
  prompts,
  generation,
  bulkEdit,
}: PromptEditorAIPanelProps): React.ReactElement {
  const promptContext = prompts.map((p) => ({
    id: p.id,
    text: p.fullPrompt,
    shortText: p.shortPrompt,
    hidden: false,
  }));

  return (
    <Collapsible
      open={expanded}
      onOpenChange={onExpandedChange}
      className={isMobile ? 'px-2' : 'px-6'}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className={
            expanded
              ? 'w-full justify-between p-4 hover:bg-accent/50 border border-accent-foreground/10 rounded-lg'
              : 'w-full justify-between p-4 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-red-500/20 border border-pink-400/40 hover:from-purple-500/30 hover:to-red-500/30'
          }
          onTouchStart={onTouchStart}
          onClick={onToggle}
        >
          <div className="flex items-center gap-2">
            <Wand2Icon className="h-4 w-4" />
            <span className="font-light flex items-center gap-1">
              AI Prompt Tools
              {!expanded && <Sparkles className="h-3 w-3 text-pink-400 animate-pulse" />}
            </span>
          </div>
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="bg-accent/30 border border-accent-foreground/10 rounded-lg p-4">
          <Tabs value={activeTab} onValueChange={(value) => onActiveTabChange(value as EditorMode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger
                value="generate"
                className="w-full hover:bg-accent/50 data-[active]:hover:bg-background"
                title="Generate new prompts"
              >
                <Wand2Icon className="mr-2 h-4 w-4" />
                Generate
              </TabsTrigger>
              <TabsTrigger
                value="remix"
                className="w-full hover:bg-accent/50 data-[active]:hover:bg-background"
                title="Remix existing prompts"
              >
                <Shuffle className="mr-2 h-4 w-4" />
                Remix
              </TabsTrigger>
              <TabsTrigger
                value="bulk-edit"
                className="w-full hover:bg-accent/50 data-[active]:hover:bg-background"
                title="Edit existing prompts"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </TabsTrigger>
            </TabsList>
            <TabsContent value="generate">
              {activeTab === 'generate' && (
                <PromptGenerationControls
                  onGenerate={generation.onGenerate}
                  onGenerateAndQueue={generation.onGenerateAndQueue}
                  isGenerating={generation.isGenerating}
                  initialValues={generation.values}
                  onValuesChange={generation.onValuesChange}
                  hasApiKey
                  existingPromptsForContext={promptContext}
                />
              )}
            </TabsContent>
            <TabsContent value="remix">
              {activeTab === 'remix' && (
                <PromptGenerationControls
                  onGenerate={generation.onGenerate}
                  onGenerateAndQueue={generation.onGenerateAndQueue}
                  isGenerating={generation.isGenerating}
                  initialValues={generation.values}
                  onValuesChange={generation.onValuesChange}
                  hasApiKey
                  existingPromptsForContext={promptContext}
                  remixMode
                />
              )}
            </TabsContent>
            <TabsContent value="bulk-edit">
              {activeTab === 'bulk-edit' && (
                <BulkEditControls
                  onBulkEdit={bulkEdit.onBulkEdit}
                  isEditing={bulkEdit.isEditing}
                  initialValues={bulkEdit.values}
                  onValuesChange={bulkEdit.onValuesChange}
                  hasApiKey
                  numberOfPromptsToEdit={prompts.length}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
