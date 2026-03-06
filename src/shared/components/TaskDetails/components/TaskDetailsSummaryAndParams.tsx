import React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { GenerationDetails } from '@/domains/generation/components/GenerationDetails';
import type { LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import { Task } from '@/types/tasks';

interface TaskDetailsSummaryAndParamsProps {
  task: Task;
  inputImages: string[];
  detailsVariant: 'modal' | 'panel';
  isMobile: boolean;
  availableLoras: LoraModel[] | undefined;
  showAllImages: boolean;
  onShowAllImagesChange: (show: boolean) => void;
  showFullPrompt: boolean;
  onShowFullPromptChange: (show: boolean) => void;
  showFullNegativePrompt: boolean;
  onShowFullNegativePromptChange: (show: boolean) => void;
  showDetailedParams: boolean;
  onShowDetailedParamsChange: (show: boolean) => void;
  paramsCopied: boolean;
  onCopyParams: () => void;
  showCopyButtons?: boolean;
  children?: React.ReactNode;
}

export const TaskDetailsSummaryAndParams: React.FC<TaskDetailsSummaryAndParamsProps> = ({
  task,
  inputImages,
  detailsVariant,
  isMobile,
  availableLoras,
  showAllImages,
  onShowAllImagesChange,
  showFullPrompt,
  onShowFullPromptChange,
  showFullNegativePrompt,
  onShowFullNegativePromptChange,
  showDetailedParams,
  onShowDetailedParamsChange,
  paramsCopied,
  onCopyParams,
  showCopyButtons = false,
  children,
}) => {
  const isModal = detailsVariant === 'modal';
  const iconClass = isModal ? 'h-4 w-4' : 'h-3.5 w-3.5';
  const copyButtonClass = isModal ? 'h-8 px-2 -ml-2' : 'h-7 px-2 -ml-2';
  const toggleButtonClass = isModal
    ? 'h-8 px-2'
    : 'h-7 px-2 flex items-center gap-x-1 text-muted-foreground hover:text-foreground';
  const generationDetailsProps = {
    task,
    inputImages,
    variant: detailsVariant,
    isMobile,
    showAllImages,
    onShowAllImagesChange,
    showFullPrompt,
    onShowFullPromptChange,
    showFullNegativePrompt,
    onShowFullNegativePromptChange,
    availableLoras,
    showCopyButtons,
  } as const;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <GenerationDetails {...generationDetailsProps} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCopyParams}
              className={copyButtonClass}
              title="Copy all parameters"
            >
              {paramsCopied
                ? <Check className={`${iconClass} text-green-500`} />
                : <Copy className={iconClass} />}
            </Button>
            {isModal ? (
              <h3 className="text-lg font-light text-foreground">Detailed Task Parameters</h3>
            ) : (
              <h4 className="text-sm font-medium text-muted-foreground">Detailed Task Parameters</h4>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onShowDetailedParamsChange(!showDetailedParams)}
            className={toggleButtonClass}
          >
            <svg
              className={`${iconClass} transition-transform ${showDetailedParams ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            <span className="ml-1 text-xs">{showDetailedParams ? 'Hide' : 'Show'}</span>
          </Button>
        </div>

        {showDetailedParams && (
          isModal ? (
            <div className="bg-muted/30 rounded-lg border p-4">
              <div className="max-h-96 overflow-y-auto">
                <pre className="text-xs font-mono text-foreground whitespace-pre-wrap break-words leading-relaxed">
                  {JSON.stringify(task.params ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="bg-muted/30 rounded-lg border p-4 overflow-hidden">
              <div className="overflow-x-auto">
                <pre
                  className="text-xs font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed min-w-0"
                  style={{ wordBreak: 'break-all', overflowWrap: 'break-word' }}
                >
                  {JSON.stringify(task.params ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          )
        )}
      </div>

      {children}
    </div>
  );
};
