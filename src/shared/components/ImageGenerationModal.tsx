import React, { useState, useRef, useCallback, Suspense, useId } from 'react';
import { createPortal } from 'react-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { ImageGenerationForm } from '@/shared/components/ImageGenerationForm';
import { ImageGenerationFormHandles } from '@/shared/components/ImageGenerationForm/types';
import { createBatchImageGenerationTasks, BatchImageGenerationTaskParams } from '@/shared/lib/tasks/imageGeneration';
import { useApiKeys } from '@/shared/hooks/useApiKeys';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ImageGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Pre-select a specific shot when the modal opens */
  initialShotId?: string | null;
}

export const ImageGenerationModal: React.FC<ImageGenerationModalProps> = ({
  isOpen,
  onClose,
  initialShotId,
}) => {
  const modal = useExtraLargeModal();
  const formRef = useRef<ImageGenerationFormHandles>(null);
  const footerPortalId = useId();
  const { selectedProjectId } = useProject();
  const queryClient = useQueryClient();
  const { getApiKey } = useApiKeys();
  const navigate = useNavigate();
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [justQueued, setJustQueued] = useState(false);
  const justQueuedTimeoutRef = useRef<number | null>(null);
  
  const falApiKey = getApiKey('fal_api_key');
  const openaiApiKey = getApiKey('openai_api_key');

  const handleGenerate = useCallback(async (taskParams: BatchImageGenerationTaskParams) => {
    console.log('[ImageGenerationModal] handleGenerate called with:', {
      hasTaskParams: !!taskParams,
      promptCount: taskParams?.prompts?.length,
      imagesPerPrompt: taskParams?.imagesPerPrompt,
      modelName: taskParams?.model_name,
      selectedProjectId,
    });

    if (!selectedProjectId) {
      toast.error("No project selected. Please select a project before generating images.");
      return;
    }

    setIsGenerating(true);
    const incomingTaskId = addIncomingTask({
      taskType: 'image_generation',
      label: taskParams.prompts?.[0]?.text?.substring(0, 50) || 'Generating images...',
    });
    try {
      console.log('[ImageGenerationModal] Creating batch image generation tasks with params:', taskParams);
      await createBatchImageGenerationTasks(taskParams);

      // Invalidate generations to ensure they refresh when tasks complete
      queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(selectedProjectId) });

      console.log('[ImageGenerationModal] Image generation tasks created successfully');
      setJustQueued(true);

      if (justQueuedTimeoutRef.current) {
        clearTimeout(justQueuedTimeoutRef.current);
      }
      justQueuedTimeoutRef.current = window.setTimeout(() => {
        setJustQueued(false);
        justQueuedTimeoutRef.current = null;
      }, 1500);

    } catch (error) {
      handleError(error, { context: 'ImageGenerationModal', toastTitle: 'Failed to create tasks' });
    } finally {
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
      removeIncomingTask(incomingTaskId);
      setIsGenerating(false);
    }
  }, [selectedProjectId, queryClient, addIncomingTask, removeIncomingTask]);

  // Cleanup timeout on unmount
  React.useEffect(() => {
    return () => {
      if (justQueuedTimeoutRef.current) {
        clearTimeout(justQueuedTimeoutRef.current);
      }
    };
  }, []);

  const handleNavigateToTool = useCallback(() => {
    onClose();
    navigate('/tools/image-generation');
  }, [onClose, navigate]);

  // Check if product tour is active (Joyride elements exist in DOM)
  const isTourActive = useCallback(() => {
    return !!document.querySelector('.react-joyride__overlay');
  }, []);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // Check tour status fresh (not stale render-time value)
        const tourActiveNow = isTourActive();
        console.log('[ProductTour] Modal onOpenChange:', { open, tourActiveNow });

        // During tour, the modal is controlled entirely by the isOpen prop
        // (which is set by the closeGenerationModal event from ProductTour)
        // So we ignore onOpenChange during the tour
        if (!open && tourActiveNow) {
          console.log('[ProductTour] Blocking modal close (tour active)');
          return;
        }
        if (!open) onClose();
      }}
      // Always non-modal so we can control closing behavior ourselves
      modal={false}
    >
      {/* Custom overlay portaled to body since modal={false} doesn't render the default one */}
      {isOpen && createPortal(
        <div
          className="fixed inset-0 z-[100002] bg-black/80 animate-in fade-in-0 duration-200"
          onClick={() => !isTourActive() && onClose()}
        />,
        document.body
      )}
      <DialogContent
        className={modal.className}
        style={{
          ...modal.style,
          maxWidth: '900px',
        }}
      >
        <DialogHeader className={modal.headerClass}>
          <div className="flex items-center gap-2">
            <DialogTitle className="text-xl font-light">Generate Images</DialogTitle>
            <Tooltip delayDuration={500}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleNavigateToTool} className="h-7 w-7">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Open Tool</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </DialogHeader>
        
        <div className={`${modal.scrollClass} -mx-6 px-6 flex-1 min-h-0 pb-4`}>
          <Suspense fallback={
            <div className="flex flex-col h-full">
              <div className="space-y-6 py-4 flex-1">
                {/* Main Content Layout - matches flex gap-6 flex-col md:flex-row */}
                <div className="flex gap-6 flex-col md:flex-row">
                  {/* Left Column - Prompts and Shot Selector */}
                  <div className="flex-1 space-y-6">
                    {/* PromptsSection skeleton */}
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-32" />
                      <div className="space-y-3">
                        <Skeleton className="h-24 w-full rounded-md" />
                        <Skeleton className="h-24 w-full rounded-md" />
                      </div>
                      <div className="flex gap-2">
                        <Skeleton className="h-9 flex-1 rounded-md" />
                        <Skeleton className="h-9 w-24 rounded-md" />
                      </div>
                    </div>
                    {/* ShotSelector skeleton */}
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-10 w-full rounded-md" />
                    </div>
                  </div>

                  {/* Right Column - ModelSection */}
                  <div className="md:w-80 space-y-6">
                    {/* ModelSection skeleton */}
                    <div className="space-y-4">
                      <Skeleton className="h-8 w-40" />
                      <div className="space-y-3">
                        <Skeleton className="h-32 w-full rounded-md" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-10 w-full rounded-md" />
                        </div>
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-10 w-full rounded-md" />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }>
            <ImageGenerationForm
              ref={formRef}
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              hasApiKey={true}
              apiKey={falApiKey}
              openaiApiKey={openaiApiKey}
              justQueued={justQueued}
              stickyFooter={true}
              footerPortalId={footerPortalId}
              initialShotId={initialShotId}
            />
          </Suspense>
        </div>

        {/* Footer portal target - outside scroll container so scrollbar appears behind it */}
        <div id={footerPortalId} className="-mx-6 -mb-6" />
      </DialogContent>
    </Dialog>
  );
};

