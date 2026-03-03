import React from 'react';
import { PromptInputRow, type PromptEntry } from '@/shared/components/ImageGenerationForm';

interface PromptEditorPromptListProps {
  prompts: PromptEntry[];
  isMobile: boolean;
  isLoading: boolean;
  activePromptIdForFullView: string | null;
  onActivePromptChange: (id: string | null) => void;
  onUpdatePromptField: (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => void;
  onRemovePrompt: (id: string) => void;
}

export function PromptEditorPromptList({
  prompts,
  isMobile,
  isLoading,
  activePromptIdForFullView,
  onActivePromptChange,
  onUpdatePromptField,
  onRemovePrompt,
}: PromptEditorPromptListProps): React.ReactElement {
  return (
    <div>
      <div className={isMobile ? 'px-2 py-4 pb-1' : 'p-6 pb-2'}>
        {prompts.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No prompts yet. Add one manually or use AI generation.
          </div>
        )}
        {prompts.map((prompt, index) => (
          <div key={prompt.id} className="mb-4" data-prompt-field data-prompt-id={prompt.id}>
            <PromptInputRow
              promptEntry={prompt}
              index={index}
              totalPrompts={prompts.length}
              onUpdate={onUpdatePromptField}
              onRemove={() => onRemovePrompt(prompt.id)}
              canRemove={prompts.length > 1}
              isGenerating={isLoading}
              onSetActiveForFullView={onActivePromptChange}
              isActiveForFullView={activePromptIdForFullView === prompt.id}
              autoEnterEditWhenActive={isMobile}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
