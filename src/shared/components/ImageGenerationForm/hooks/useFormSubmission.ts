/**
 * useFormSubmission - Handles form submission and task creation
 *
 * Handles:
 * - Building task params from form state
 * - Automated mode (AI prompt generation → task creation)
 * - Managed mode (direct task creation)
 * - Fire-and-forget background operations
 */

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';
import { BatchImageGenerationTaskParams } from '@/shared/lib/tasks/imageGeneration';
import {
  PromptEntry,
  HiresFixConfig,
  ReferenceApiParams,
  ReferenceMode,
  PromptMode,
  GenerationSource,
  TextToImageModel,
} from '../types';
import { buildBatchTaskParams } from './buildBatchTaskParams';

// ============================================================================
// Types
// ============================================================================

export interface UseFormSubmissionProps {
  // Project context
  selectedProjectId: string | undefined;

  // Form state
  prompts: PromptEntry[];
  imagesPerPrompt: number;
  promptMultiplier: number;
  associatedShotId: string | null;
  currentBeforePromptText: string;
  currentAfterPromptText: string;
  currentStyleBoostTerms: string;
  isLocalGenerationEnabled: boolean;
  hiresFixConfig: HiresFixConfig;
  effectivePromptMode: PromptMode;
  masterPromptText: string;
  actionablePromptsCount: number;

  // Generation source
  generationSourceRef: React.MutableRefObject<GenerationSource>;
  selectedTextModelRef: React.MutableRefObject<TextToImageModel>;
  styleReferenceImageGeneration: string | null;

  // Reference settings
  currentStyleStrength: number;
  currentSubjectStrength: number;
  effectiveSubjectDescription: string;
  currentInThisScene: boolean;
  currentInThisSceneStrength: number;
  referenceMode: ReferenceMode;

  // AI prompt generation
  aiGeneratePrompts: (params: {
    overallPromptText: string;
    numberToGenerate: number;
    existingPrompts?: Array<{ id: string; text: string; shortText?: string }>;
    includeExistingContext?: boolean;
    addSummaryForNewPrompts?: boolean;
    replaceCurrentPrompts?: boolean;
    temperature?: number;
    rulesToRememberText?: string;
  }) => Promise<Array<{ id: string; text: string; shortText?: string }>>;

  // Task status for baseline tracking
  taskStatusCounts: { processing: number } | undefined;

  // Callbacks
  onGenerate: (params: BatchImageGenerationTaskParams) => Promise<string[]> | string[] | void;
  setPrompts: (prompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => void;

  // Submit button state
  automatedSubmitButton: {
    trigger: () => void;
    isSubmitting: boolean;
    isSuccess: boolean;
  };
}

export interface UseFormSubmissionReturn {
  // Handlers
  getTaskParams: (
    promptsToUse: PromptEntry[],
    options?: { imagesPerPromptOverride?: number }
  ) => BatchImageGenerationTaskParams | null;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  handleGenerateAndQueue: (updatedPrompts: PromptEntry[]) => void;
  handleUseExistingPrompts: () => Promise<void>;
  handleNewPromptsLikeExisting: () => Promise<void>;

  // State
  isGeneratingAutomatedPrompts: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useFormSubmission(props: UseFormSubmissionProps): UseFormSubmissionReturn {
  const {
    selectedProjectId,
    prompts,
    imagesPerPrompt,
    promptMultiplier,
    associatedShotId,
    currentBeforePromptText,
    currentAfterPromptText,
    currentStyleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    effectivePromptMode,
    masterPromptText,
    actionablePromptsCount,
    generationSourceRef,
    selectedTextModelRef,
    styleReferenceImageGeneration,
    currentStyleStrength,
    currentSubjectStrength,
    effectiveSubjectDescription,
    currentInThisScene,
    currentInThisSceneStrength,
    referenceMode,
    aiGeneratePrompts,
    taskStatusCounts,
    onGenerate,
    setPrompts,
    automatedSubmitButton,
  } = props;

  const queryClient = useQueryClient();
  const { addIncomingTask, completeIncomingTask } = useIncomingTasks();

  // Track automated prompt generation state
  const isGeneratingAutomatedPromptsRef = useRef(false);

  // ============================================================================
  // Build Task Params
  // ============================================================================

  const getTaskParams = useCallback((
    promptsToUse: PromptEntry[],
    options?: { imagesPerPromptOverride?: number }
  ): BatchImageGenerationTaskParams | null => {
    const activePrompts = promptsToUse.filter(p => p.fullPrompt.trim() !== "");

    if (activePrompts.length === 0) {
      toast.error("Please enter at least one valid prompt.");
      return null;
    }

    const currentGenerationSource = generationSourceRef.current;
    const currentTextModel = selectedTextModelRef.current;

    // Validate: require style reference for by-reference mode
    if (currentGenerationSource === 'by-reference' && !styleReferenceImageGeneration) {
      toast.error("Please upload a style reference image for by-reference mode.");
      return null;
    }

    // Only include reference params for by-reference mode
    const referenceParams: ReferenceApiParams = currentGenerationSource === 'by-reference' ? {
      style_reference_image: styleReferenceImageGeneration ?? undefined,
      style_reference_strength: currentStyleStrength,
      subject_strength: currentSubjectStrength,
      subject_description: effectiveSubjectDescription,
      in_this_scene: currentInThisScene,
      in_this_scene_strength: currentInThisSceneStrength,
      reference_mode: referenceMode,
    } : {};

    return buildBatchTaskParams({
      projectId: selectedProjectId!,
      prompts: activePrompts,
      imagesPerPrompt: options?.imagesPerPromptOverride ?? imagesPerPrompt,
      shotId: associatedShotId,
      beforePromptText: currentBeforePromptText,
      afterPromptText: currentAfterPromptText,
      styleBoostTerms: currentStyleBoostTerms,
      isLocalGenerationEnabled,
      hiresFixConfig,
      modelName: currentGenerationSource === 'just-text' ? currentTextModel : 'qwen-image',
      referenceParams,
    });
  }, [
    styleReferenceImageGeneration,
    currentStyleStrength,
    currentSubjectStrength,
    effectiveSubjectDescription,
    currentInThisScene,
    currentInThisSceneStrength,
    referenceMode,
    selectedProjectId,
    imagesPerPrompt,
    associatedShotId,
    currentBeforePromptText,
    currentAfterPromptText,
    currentStyleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    generationSourceRef,
    selectedTextModelRef,
  ]);

  // ============================================================================
  // Handle Submit
  // ============================================================================

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Handle automated mode: generate prompts first, then images
    if (effectivePromptMode === 'automated') {
      if (!masterPromptText.trim()) {
        toast.error("Please enter a master prompt.");
        return;
      }

      const currentGenerationSource = generationSourceRef.current;
      const currentTextModel = selectedTextModelRef.current;

      // Validate early
      if (currentGenerationSource === 'by-reference' && !styleReferenceImageGeneration) {
        toast.error("Please upload a style reference image for by-reference mode.");
        return;
      }

      // Capture current values for background operation
      const capturedMasterPrompt = masterPromptText;
      const capturedImagesPerPrompt = imagesPerPrompt;
      const capturedPromptMultiplier = promptMultiplier;
      const capturedProjectId = selectedProjectId!;
      const capturedAssociatedShotId = associatedShotId;
      const capturedGenerationSource = currentGenerationSource;
      const capturedStyleRef = styleReferenceImageGeneration;
      const capturedStyleStrength = currentStyleStrength;
      const capturedSubjectStrength = currentSubjectStrength;
      const capturedSubjectDescription = effectiveSubjectDescription;
      const capturedInThisScene = currentInThisScene;
      const capturedInThisSceneStrength = currentInThisSceneStrength;
      const capturedReferenceMode = referenceMode;
      const capturedBeforePromptText = currentBeforePromptText;
      const capturedAfterPromptText = currentAfterPromptText;
      const capturedStyleBoostTerms = currentStyleBoostTerms;
      const capturedIsLocalGenerationEnabled = isLocalGenerationEnabled;
      const capturedHiresFixConfig = hiresFixConfig;
      const capturedModelName = currentGenerationSource === 'just-text' ? currentTextModel : 'qwen-image';

      // Trigger button state
      automatedSubmitButton.trigger();

      // Add incoming task filler
      const truncatedPrompt = capturedMasterPrompt.length > 50
        ? capturedMasterPrompt.substring(0, 50) + '...'
        : capturedMasterPrompt;
      const currentBaseline = taskStatusCounts?.processing ?? 0;
      const incomingTaskId = addIncomingTask({
        taskType: 'image_generation',
        label: truncatedPrompt,
        expectedCount: capturedImagesPerPrompt * capturedPromptMultiplier,
        baselineCount: currentBaseline,
      });

      // Fire-and-forget background operation
      (async () => {
        try {
          isGeneratingAutomatedPromptsRef.current = true;

          const rawResults = await aiGeneratePrompts({
            overallPromptText: capturedMasterPrompt,
            numberToGenerate: capturedImagesPerPrompt,
            includeExistingContext: false,
            addSummaryForNewPrompts: true,
            replaceCurrentPrompts: true,
            temperature: 0.8,
            rulesToRememberText: '',
          });

          const newPrompts: PromptEntry[] = rawResults.map(item => ({
            id: item.id,
            fullPrompt: item.text,
            shortPrompt: item.shortText || item.text.substring(0, 30) + (item.text.length > 30 ? "..." : ""),
          }));

          setPrompts(newPrompts);

          // Build task params
          const referenceParams: ReferenceApiParams = capturedGenerationSource === 'by-reference' ? {
            style_reference_image: capturedStyleRef ?? undefined,
            style_reference_strength: capturedStyleStrength,
            subject_strength: capturedSubjectStrength,
            subject_description: capturedSubjectDescription,
            in_this_scene: capturedInThisScene,
            in_this_scene_strength: capturedInThisSceneStrength,
            reference_mode: capturedReferenceMode,
          } : {};

          const taskParams = buildBatchTaskParams({
            projectId: capturedProjectId,
            prompts: newPrompts,
            imagesPerPrompt: capturedPromptMultiplier,
            shotId: capturedAssociatedShotId,
            beforePromptText: capturedBeforePromptText,
            afterPromptText: capturedAfterPromptText,
            styleBoostTerms: capturedStyleBoostTerms,
            isLocalGenerationEnabled: capturedIsLocalGenerationEnabled,
            hiresFixConfig: capturedHiresFixConfig,
            modelName: capturedModelName,
            referenceParams,
          });

          await onGenerate(taskParams);
        } catch (error) {
          handleError(error, { context: 'useFormSubmission.handleSubmit.automatedMode', toastTitle: 'Failed to generate prompts. Please try again.' });
        } finally {
          isGeneratingAutomatedPromptsRef.current = false;
          await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
          await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
          const newCount = queryClient.getQueryData<{ processing: number }>(queryKeys.tasks.statusCounts(selectedProjectId))?.processing ?? 0;
          completeIncomingTask(incomingTaskId, newCount);
        }
      })();

      return;
    }

    // Managed mode: use getTaskParams
    const taskParams = getTaskParams(prompts);
    if (!taskParams) return;

    automatedSubmitButton.trigger();

    // Add incoming task filler
    const firstPrompt = prompts.find(p => p.fullPrompt.trim())?.fullPrompt || 'Generating...';
    const truncatedPrompt = firstPrompt.length > 50
      ? firstPrompt.substring(0, 50) + '...'
      : firstPrompt;
    const managedBaseline = taskStatusCounts?.processing ?? 0;
    const incomingTaskId = addIncomingTask({
      taskType: 'image_generation',
      label: truncatedPrompt,
      expectedCount: actionablePromptsCount * imagesPerPrompt,
      baselineCount: managedBaseline,
    });

    // Fire-and-forget
    (async () => {
      try {
        await onGenerate(taskParams);
      } catch (error) {
        handleError(error, { context: 'useFormSubmission.handleSubmit.managedMode', toastTitle: 'Failed to create tasks. Please try again.' });
      } finally {
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
        await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
        const newCount = queryClient.getQueryData<{ processing: number }>(queryKeys.tasks.statusCounts(selectedProjectId))?.processing ?? 0;
        completeIncomingTask(incomingTaskId, newCount);
      }
    })();
  }, [
    effectivePromptMode,
    masterPromptText,
    generationSourceRef,
    selectedTextModelRef,
    styleReferenceImageGeneration,
    imagesPerPrompt,
    promptMultiplier,
    selectedProjectId,
    associatedShotId,
    currentStyleStrength,
    currentSubjectStrength,
    effectiveSubjectDescription,
    currentInThisScene,
    currentInThisSceneStrength,
    referenceMode,
    currentBeforePromptText,
    currentAfterPromptText,
    currentStyleBoostTerms,
    isLocalGenerationEnabled,
    hiresFixConfig,
    automatedSubmitButton,
    taskStatusCounts,
    addIncomingTask,
    aiGeneratePrompts,
    setPrompts,
    onGenerate,
    queryClient,
    completeIncomingTask,
    getTaskParams,
    prompts,
    actionablePromptsCount,
  ]);

  // ============================================================================
  // Handle Generate And Queue
  // ============================================================================

  const handleGenerateAndQueue = useCallback((updatedPrompts: PromptEntry[]) => {

    // Save prompts to state
    const seenIds = new Set<string>();
    const sanitizedPrompts = updatedPrompts.map(original => {
      let id = original.id && !seenIds.has(original.id) ? original.id : "";
      if (!id) {
        id = `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      seenIds.add(id);
      return {
        ...original,
        id,
        shortPrompt: original.shortPrompt || (original.fullPrompt.substring(0, 30) + (original.fullPrompt.length > 30 ? "..." : "")),
      };
    });

    setPrompts(sanitizedPrompts);

    // Build task params
    const taskParams = getTaskParams(updatedPrompts);
    if (!taskParams) return;

    onGenerate(taskParams);
  }, [setPrompts, getTaskParams, onGenerate]);

  // ============================================================================
  // Handle Use Existing Prompts
  // ============================================================================

  const handleUseExistingPrompts = useCallback(async () => {
    const taskParams = getTaskParams(prompts, { imagesPerPromptOverride: promptMultiplier });
    if (!taskParams) return;
    onGenerate(taskParams);
  }, [prompts, promptMultiplier, getTaskParams, onGenerate]);

  // ============================================================================
  // Handle New Prompts Like Existing
  // ============================================================================

  const handleNewPromptsLikeExisting = useCallback(async () => {
    const activePrompts = prompts.filter(p => p.fullPrompt.trim() !== "");
    if (activePrompts.length === 0) {
      toast.error("No prompts available. Please add prompts first.");
      return;
    }

    if (generationSourceRef.current === 'by-reference' && !styleReferenceImageGeneration) {
      toast.error("Please upload a style reference image for by-reference mode.");
      return;
    }

    try {
      isGeneratingAutomatedPromptsRef.current = true;

      const rawResults = await aiGeneratePrompts({
        overallPromptText: "Make me more prompts like this.",
        numberToGenerate: imagesPerPrompt,
        existingPrompts: activePrompts.map(p => ({ id: p.id, text: p.fullPrompt, shortText: p.shortPrompt })),
        addSummaryForNewPrompts: true,
        replaceCurrentPrompts: true,
        temperature: 0.8,
        rulesToRememberText: '',
      });

      const newPrompts: PromptEntry[] = rawResults.map(item => ({
        id: item.id,
        fullPrompt: item.text,
        shortPrompt: item.shortText || item.text.substring(0, 30) + (item.text.length > 30 ? "..." : ""),
      }));

      setPrompts(newPrompts);

      const taskParams = getTaskParams(newPrompts, { imagesPerPromptOverride: promptMultiplier });
      if (!taskParams) return;

      onGenerate(taskParams);
    } catch (error) {
      handleError(error, { context: 'useFormSubmission.handleNewPromptsLikeExisting', toastTitle: 'Failed to generate prompts. Please try again.' });
    } finally {
      isGeneratingAutomatedPromptsRef.current = false;
    }
  }, [
    prompts,
    styleReferenceImageGeneration,
    generationSourceRef,
    imagesPerPrompt,
    promptMultiplier,
    getTaskParams,
    onGenerate,
    aiGeneratePrompts,
    setPrompts,
  ]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    getTaskParams,
    handleSubmit,
    handleGenerateAndQueue,
    handleUseExistingPrompts,
    handleNewPromptsLikeExisting,
    isGeneratingAutomatedPrompts: isGeneratingAutomatedPromptsRef.current,
  };
}
