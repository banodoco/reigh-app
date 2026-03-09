import React from 'react';
import { Button } from '../../ui/button';
import { Check, Copy } from 'lucide-react';
import type { getVariantConfig } from '../../../types/taskDetailsTypes';

interface TaskPromptDetailsProps {
  config: ReturnType<typeof getVariantConfig>;
  prompt: string | undefined;
  enhancePrompt: string | undefined;
  negativePrompt: string | undefined;
  showFullPrompt: boolean;
  onShowFullPromptChange?: (show: boolean) => void;
  showFullNegativePrompt: boolean;
  onShowFullNegativePromptChange?: (show: boolean) => void;
  showCopyButtons: boolean;
  copiedPrompt: boolean;
  onCopyPrompt: (text: string) => void;
}

export const TaskPromptDetails: React.FC<TaskPromptDetailsProps> = ({
  config,
  prompt,
  enhancePrompt,
  negativePrompt,
  showFullPrompt,
  onShowFullPromptChange,
  showFullNegativePrompt,
  onShowFullNegativePromptChange,
  showCopyButtons,
  copiedPrompt,
  onCopyPrompt,
}) => {
  return (
    <div className="space-y-3 pt-1">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Prompt{enhancePrompt ? ' (enhanced)' : ''}
          </p>
          {prompt && showCopyButtons && (
            <button
              onClick={() => onCopyPrompt(prompt)}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Copy prompt"
            >
              {copiedPrompt
                ? <Check className="w-3.5 h-3.5 text-green-500" />
                : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
        <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap preserve-case`}>
          {prompt
            ? (showFullPrompt || prompt.length <= config.promptLength
              ? prompt
              : `${prompt.slice(0, config.promptLength)}...`)
            : 'None'}
        </p>
        {prompt && prompt.length > config.promptLength && onShowFullPromptChange && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onShowFullPromptChange(!showFullPrompt)}
            className="h-6 px-0 text-xs text-primary"
          >
            {showFullPrompt ? 'Show Less' : 'Show More'}
          </Button>
        )}
      </div>

      {negativePrompt && negativePrompt !== 'N/A' && (
        <div className="space-y-1">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Negative Prompt</p>
          <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap preserve-case`}>
            {showFullNegativePrompt || negativePrompt.length <= config.negativePromptLength
              ? negativePrompt
              : `${negativePrompt.slice(0, config.negativePromptLength)}...`}
          </p>
          {negativePrompt.length > config.negativePromptLength && onShowFullNegativePromptChange && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onShowFullNegativePromptChange(!showFullNegativePrompt)}
              className="h-6 px-0 text-xs text-primary"
            >
              {showFullNegativePrompt ? 'Show Less' : 'Show More'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
