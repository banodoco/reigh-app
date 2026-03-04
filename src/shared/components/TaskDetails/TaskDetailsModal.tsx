/**
 * TaskDetailsModal
 *
 * Modal dialog for viewing detailed task information for a generation.
 * Shows input images, settings, parameters, and allows applying settings.
 *
 * Moved from tools/travel-between-images/components/TaskDetailsModal.tsx
 * to shared/ because it's used by MediaGalleryLightbox and other shared components.
 */

import React, { useCallback, useState, ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useLargeModal } from '@/shared/hooks/useModal';
import { Label } from '@/shared/components/ui/primitives/label';
import { normalizeTaskDetailsPayload } from '@/shared/components/TaskDetails/hooks/normalizeTaskDetailsPayload';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useGenerationTaskDetails } from '@/shared/components/TaskDetails/hooks/useGenerationTaskDetails';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { TaskDetailsSummaryAndParams } from '@/shared/components/TaskDetails/components/TaskDetailsSummaryAndParams';
import { AlertTriangle } from 'lucide-react';

interface TaskDetailsModalProps {
  generationId: string;
  children?: ReactNode;
  onApplySettingsFromTask?: (taskId: string, replaceImages: boolean, inputImages: string[]) => void;
  onClose?: () => void;
  onShowVideo?: () => void;
  isVideoContext?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

const TaskDetailsModal: React.FC<TaskDetailsModalProps> = ({ generationId, children, onApplySettingsFromTask, onClose, onShowVideo, isVideoContext, open, onOpenChange }) => {
  const isMobile = useIsMobile();
  const modal = useLargeModal();
  const [internalOpen, setInternalOpen] = useState(false);

  // Use controlled state if provided, otherwise fall back to internal state
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [replaceImages, setReplaceImages] = useState(true);
  const [showDetailedParams, setShowDetailedParams] = useState(false);
  const [showAllImages, setShowAllImages] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  const [showFullNegativePrompt, setShowFullNegativePrompt] = useState(false);
  const [paramsCopied, setParamsCopied] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const { selectedProjectId } = useProject();
  const { data: availableLoras } = usePublicLoras();

  const {
    taskId,
    task,
    inputImages,
    isLoadingTask,
    taskError,
    taskDetailsStatus,
  } = useGenerationTaskDetails({
    generationId,
    projectId: selectedProjectId ?? null,
    enabled: isOpen,
    resolveMappingOnDemand: true,
  });

  const handleCopyParams = useCallback(async () => {
    if (!task?.params) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(task.params, null, 2));
      setParamsCopied(true);
      setTimeout(() => setParamsCopied(false), 2000);
    } catch (err) {
      normalizeAndPresentError(err, { context: 'TaskDetailsModal', showToast: false });
    }
  }, [task?.params]);

  const handleCopyId = useCallback(() => {
    if (!taskId) return;
    navigator.clipboard.writeText(taskId);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  }, [taskId]);

  const normalizedTaskPayload = React.useMemo(() => normalizeTaskDetailsPayload(task), [task]);
  const detailInputImages = normalizedTaskPayload.inputImages.length > 0
    ? normalizedTaskPayload.inputImages
    : inputImages;

  const handleApplySettingsFromTask = () => {
    if (taskId && onApplySettingsFromTask && task) {
      // Pass the correctly ordered inputImages array (derived from task JSON sources)
      onApplySettingsFromTask(taskId, replaceImages, detailInputImages);
    }
    setIsOpen(false);
    onClose?.();
  };

  const isLoading = isLoadingTask;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        // If the dialog is transitioning from open -> closed, notify parent
        if (!open && onClose) {
          onClose();
        }
      }}
    >
      {/* Avoid rendering an active trigger when controlled via `open` to prevent unintended close events */}
      {!open && children && <DialogTrigger asChild>{children}</DialogTrigger>}
      <DialogContent
        className={modal.className}
        style={modal.style}
        aria-describedby="task-details-description"
      >
        <div className={modal.headerClass}>
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="sr-only">Task Details</DialogTitle>
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
            <p id="task-details-description" className="sr-only">
              View details about the task that generated this video, including input images, settings, and parameters.
            </p>
          </DialogHeader>
        </div>

        <div className={modal.scrollClass}>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="flex flex-col items-center gap-y-3">
                <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-sm text-muted-foreground">Loading task details...</p>
              </div>
            </div>
          ) : taskDetailsStatus === 'error' && !task ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-center space-y-2 max-w-sm">
                <div className="w-12 h-12 mx-auto bg-red-500/10 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm font-medium">Failed to load task details.</p>
                <p className="text-xs text-muted-foreground">{taskError?.message ?? 'Please try again.'}</p>
              </div>
            </div>
          ) : task ? (
            <div className="space-y-6 p-4">
              <TaskDetailsSummaryAndParams
                task={task}
                inputImages={detailInputImages}
                detailsVariant="modal"
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
              />
            </div>
          ) : (
            <div className="flex justify-center items-center h-64">
              <div className="text-center space-y-2">
                <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-sm text-muted-foreground">No task details available for this generation.</p>
              </div>
            </div>
          )}
        </div>

        <div className={modal.footerClass}>
          <DialogFooter className="pt-4 border-t">
           <div className="flex w-full items-center gap-3">
              {detailInputImages.length > 0 && (
                <>
                  <div className="flex items-center gap-x-2">
                    <Checkbox
                      id="replaceImages"
                      checked={replaceImages}
                      onCheckedChange={(checked) => setReplaceImages(checked as boolean)}
                    />
                    <Label htmlFor="replaceImages" className={`text-sm font-light ${isMobile ? 'whitespace-pre-line leading-tight' : ''}`}>
                      {isMobile ? 'Replace\nthese\nimages' : 'Replace these images'}
                    </Label>
                  </div>
                  {onApplySettingsFromTask && task && taskId && (
                    <Button
                      variant="retro"
                      size="retro-sm"
                      onClick={handleApplySettingsFromTask}
                      className={`text-sm ${isMobile ? 'whitespace-pre-line leading-tight py-3 px-4 min-h-[3rem]' : ''}`}
                    >
                      {isMobile ? 'Apply\nSettings' : 'Apply Settings'}
                    </Button>
                  )}
                </>
              )}
              <div className="flex items-center gap-x-3 ml-auto">
              {/* Show Video button for mobile video context - now positioned directly to the left of close button */}
              {isMobile && isVideoContext && onShowVideo && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    // Don't close modal immediately - let the onShowVideo handler manage the timing
                    onShowVideo();
                  }}
                  className="text-sm whitespace-pre-line leading-tight py-3 px-4 min-h-[3rem]"
                >
                  {'Show\nVideo'}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setIsOpen(false)}
                className={`text-sm ${isMobile ? 'whitespace-pre-line leading-tight py-3 px-4 min-h-[2.5rem]' : ''}`}
              >
                Close
              </Button>
            </div>
          </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TaskDetailsModal;
