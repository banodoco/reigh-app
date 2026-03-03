import React from 'react';
import { DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { PackagePlus, Trash2 } from 'lucide-react';
import type { PromptEntry } from '@/shared/components/ImageGenerationForm';

interface PromptEditorFooterProps {
  showFade: boolean;
  footerClass: string;
  isMobile: boolean;
  prompts: PromptEntry[];
  onAddBlankPrompt: () => void;
  onRemoveAllPrompts: () => void;
  onClose: () => void;
}

export function PromptEditorFooter({
  showFade,
  footerClass,
  isMobile,
  prompts,
  onAddBlankPrompt,
  onRemoveAllPrompts,
  onClose,
}: PromptEditorFooterProps): React.ReactElement {
  const deleteDisabled =
    prompts.length === 1 && !prompts[0]?.fullPrompt.trim() && !prompts[0]?.shortPrompt?.trim();

  return (
    <div className={`${footerClass} relative`}>
      {showFade && (
        <div
          className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
          style={{ transform: 'translateY(-64px)' }}
        >
          <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
        </div>
      )}

      <DialogFooter
        className={`${isMobile ? 'p-4 pt-4 pb-1 flex-row justify-between' : 'p-6 pt-6 pb-2'} border-t relative z-20`}
      >
        <div className={`flex gap-2 ${isMobile ? '' : 'mr-auto'}`}>
          <Button variant="retro-secondary" size="retro-sm" onClick={onAddBlankPrompt}>
            <PackagePlus className={`h-4 w-4 ${isMobile ? '' : 'mr-2'}`} />
            <span className={isMobile ? 'hidden' : ''}>Blank Prompt</span>
            {isMobile && <span className="sr-only">Blank Prompt</span>}
          </Button>
          {prompts.length > 0 && (
            <Button
              variant="destructive"
              size="retro-sm"
              onClick={onRemoveAllPrompts}
              disabled={deleteDisabled}
            >
              <Trash2 className={`h-4 w-4 ${isMobile ? '' : 'mr-2'}`} />
              <span className={isMobile ? 'hidden' : ''}>Delete Prompts</span>
              {isMobile && <span className="sr-only">Delete Prompts</span>}
            </Button>
          )}
        </div>
        <Button variant="retro" size="retro-sm" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </div>
  );
}
