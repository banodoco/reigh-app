import React, { useCallback, useState, ReactNode } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useIsMobile } from '@/shared/hooks/mobile';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Task } from '@/types/tasks';
import { AlertTriangle, CornerDownLeft, ImageIcon } from 'lucide-react';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { TaskDetailsSummaryAndParams } from '@/shared/components/TaskDetails/components/TaskDetailsSummaryAndParams';
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

  if (isLoading) {
    return (
      <div className={`flex justify-center items-center h-64 ${className}`}>
        <div className="flex flex-col items-center gap-y-3">
          <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-sm text-muted-foreground">Loading task details...</p>
        </div>
      </div>
    );
  }

  if (resolvedStatus === 'error' && !task) {
    return (
      <div className={`flex flex-col ${className}`}>
        {basedOnSection}
        {derivedSection}
        <div className="flex justify-center items-center py-6">
          <div className="text-center space-y-2 max-w-sm">
            <div className="w-10 h-10 mx-auto bg-red-500/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <p className="text-sm font-medium">Failed to load task details.</p>
            <p className="text-xs text-muted-foreground">{error?.message ?? 'Please try again.'}</p>
          </div>
        </div>
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
          <div className="flex justify-center items-center py-6">
            <div className="text-center space-y-2">
              <div className="w-10 h-10 mx-auto bg-muted rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">No task details available for this generation.</p>
            </div>
          </div>
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
        <TaskDetailsSummaryAndParams
          task={task}
          inputImages={inputImages}
          detailsVariant="panel"
          isMobile={isMobile}
          availableLoras={availableLoras}
          showAllImages={showAllImages}
          onShowAllImagesChange={setShowAllImages}
          showFullPrompt={showFullPrompt}
          onShowFullPromptChange={setShowFullPrompt}
          showFullNegativePrompt={showFullNegativePrompt}
          onShowFullNegativePromptChange={setShowFullNegativePrompt}
          showDetailedParams={showDetailedParams}
          onShowDetailedParamsChange={setShowDetailedParams}
          paramsCopied={paramsCopied}
          onCopyParams={() => { void handleCopyParams(); }}
          showCopyButtons={true}
        >
          {basedOnSection}
          {derivedSection}
        </TaskDetailsSummaryAndParams>
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

export default TaskDetailsPanel;
