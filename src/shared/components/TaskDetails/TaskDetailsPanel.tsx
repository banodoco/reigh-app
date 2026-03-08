import React, { useCallback, useState, ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useIsMobile } from '@/shared/hooks/mobile';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Task } from '@/types/tasks';
import { CornerDownLeft, ImageIcon } from 'lucide-react';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  TaskDetailsEmptyState,
  TaskDetailsErrorState,
  TaskDetailsLoadingState,
} from '@/shared/components/TaskDetails/components/TaskDetailsStatusStates';
import {
  TaskDetailsSummaryControls,
  TaskDetailsSummarySection,
} from '@/shared/components/TaskDetails/components/TaskDetailsSummarySection';
import type { TaskDetailsStatus } from '@/domains/media-lightbox/types';

interface TaskDetailsPanelProps {
  task: Task | null;
  isLoading: boolean;
  status?: TaskDetailsStatus;
  error: Error | null;
  inputImages: string[];
  replaceImages: boolean;
  onReplaceImagesChange: (checked: boolean) => void;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  taskId: string | null;
  className?: string;
  basedOnSection?: ReactNode;
  derivedSection?: ReactNode;
  // Control whether to show user-provided source images
  showUserImage?: boolean;
  // Hide the header (title is shown in parent component)
  hideHeader?: boolean;
}

const TaskDetailsPanel: React.FC<TaskDetailsPanelProps> = ({
  task,
  isLoading,
  status,
  error,
  inputImages,
  replaceImages,
  onReplaceImagesChange,
  onApplySettingsFromTask,
  taskId,
  className = "",
  basedOnSection,
  derivedSection,
  hideHeader = false
}) => {
  const isMobile = useIsMobile();
  const resolvedStatus = status ?? (error ? 'error' : task ? 'ok' : 'missing');
  const [showDetailedParams, setShowDetailedParams] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [showFullNegativePrompt, setShowFullNegativePrompt] = useState(false);
  const [paramsCopied, setParamsCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const { data: availableLoras } = usePublicLoras();

  const handleCopyParams = useCallback(async () => {
    if (!task?.params) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(task.params, null, 2));
      setParamsCopied(true);
      setTimeout(() => setParamsCopied(false), 2000);
    } catch (err) {
      normalizeAndPresentError(err, { context: 'TaskDetailsPanel', showToast: false });
    }
  }, [task?.params]);

  const handleCopyId = useCallback(() => {
    if (!taskId) return;
    navigator.clipboard.writeText(taskId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  }, [taskId]);

  const handleApplySettingsFromTask = () => {
    if (taskId && onApplySettingsFromTask && task) {
      onApplySettingsFromTask(taskId, replaceImages, inputImages);
    }
  };
  const summaryControls: TaskDetailsSummaryControls = {
    showAllImages,
    onShowAllImagesChange: setShowAllImages,
    showFullPrompt,
    onShowFullPromptChange: setShowFullPrompt,
    showFullNegativePrompt,
    onShowFullNegativePromptChange: setShowFullNegativePrompt,
    showDetailedParams,
    onShowDetailedParamsChange: setShowDetailedParams,
    paramsCopied,
    onCopyParams: () => {
      void handleCopyParams();
    },
  };

  if (isLoading) {
    return (
      <TaskDetailsLoadingState containerClassName={`h-64 ${className}`} />
    );
  }

  if (resolvedStatus === 'error' && !task) {
    return (
      <div className={`flex flex-col ${className}`}>
        {basedOnSection}
        {derivedSection}
        <TaskDetailsErrorState
          errorMessage={error?.message}
          containerClassName="py-6"
          iconWrapperClassName="w-10 h-10"
          iconClassName="w-5 h-5"
        />
      </div>
    );
  }

  if (!task) {
    return (
      <div className={`flex flex-col ${className}`}>
        {/* Based On Section - show even without task details */}
        {basedOnSection}

        {/* Derived Generations Section - show even without task details */}
        {derivedSection}

        {/* No task message - only show if there's also no based on or derived sections */}
        {!basedOnSection && !derivedSection && (
          <TaskDetailsEmptyState
            containerClassName="py-6"
            iconWrapperClassName="w-10 h-10"
            iconClassName="w-5 h-5"
          />
        )}
      </div>
    );
  }

  // When hideHeader is true, we're embedded in a parent scroll container (like InfoPanel)
  // so don't force height or add our own ScrollArea
  const wrapperClass = hideHeader
    ? `flex flex-col ${className}`
    : `flex flex-col h-full ${className}`;

  // Match EditPanelLayout padding: p-6 desktop, p-3 mobile
  const padding = isMobile ? 'p-3' : 'p-6';

  const contentWrapper = (content: React.ReactNode) => {
    if (hideHeader) {
      // No scroll wrapper - parent handles scrolling
      return <div className={padding}>{content}</div>;
    }
    // Use ScrollArea for standalone usage
    return <ScrollArea className={`flex-1 ${padding} overflow-y-auto`}>{content}</ScrollArea>;
  };

  return (
    <div className={wrapperClass}>
      {!hideHeader && (
        <div className="flex-shrink-0 p-4 border-b">
          <div className="flex items-center justify-end">
            {taskId && (
              <button
                onClick={handleCopyId}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  idCopied ? 'text-green-400' : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700'
                }`}
              >
                {idCopied ? 'copied' : 'id'}
              </button>
            )}
          </div>
        </div>
      )}

      {contentWrapper(
        <TaskDetailsSummarySection
          task={task}
          inputImages={inputImages}
          detailsVariant="panel"
          isMobile={isMobile}
          availableLoras={availableLoras}
          controls={summaryControls}
          showCopyButtons={true}
        >
          {basedOnSection}
          {derivedSection}
        </TaskDetailsSummarySection>
      )}

      {/* Footer with controls - Sticky to bottom - only show when Apply Settings is available */}
      {onApplySettingsFromTask && task && taskId && (
        <div className="flex-shrink-0 border-t bg-gradient-to-t from-background via-background to-background/95 sticky bottom-0">
          <div className="p-4 flex items-center gap-3">
            {/* Checkbox toggle for including images */}
            {inputImages.length > 0 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-xs text-muted-foreground">Include</span>
                <label
                  htmlFor="replaceImages"
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all
                    border
                    ${replaceImages
                      ? 'bg-primary/10 border-primary/30 text-foreground'
                      : 'bg-muted/50 border-transparent text-muted-foreground hover:bg-muted'
                    }
                  `}
                >
                  <Checkbox
                    id="replaceImages"
                    checked={replaceImages}
                    onCheckedChange={(checked) => onReplaceImagesChange(checked as boolean)}
                    className="data-[checked]:bg-primary data-[checked]:border-primary"
                  />
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium whitespace-nowrap">
                    {inputImages.length} image{inputImages.length !== 1 ? 's' : ''}
                  </span>
                </label>
              </div>
            )}

            {/* Apply button */}
            <Button
              variant="retro"
              size="retro-sm"
              onClick={handleApplySettingsFromTask}
              className="flex-1 gap-2"
            >
              <CornerDownLeft className="h-4 w-4" />
              Apply Settings
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export { TaskDetailsPanel };
