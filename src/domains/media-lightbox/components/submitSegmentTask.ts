/**
 * submitSegmentTask - Shared segment task submission logic
 *
 * Extracts the duplicated ~200-line handleSubmit pattern from
 * SegmentRegenerateForm and SegmentSlotFormView into a single function.
 *
 * Both callers follow the same pattern:
 *   1. Validate inputs
 *   2. Add incoming task placeholder (for optimistic UI)
 *   3. Optionally enhance prompt via edge function
 *   4. Save enhanced prompt metadata
 *   5. Build task params
 *   6. Create the task
 *   7. Cleanup (refetch, remove placeholder)
 */

import { QueryClient } from '@tanstack/react-query';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { joinPromptParts } from '@/shared/lib/promptAssembly';
import { buildTaskParams, type SegmentSettings } from '@/shared/components/SegmentSettingsForm/segmentSettingsUtils';
import { createIndividualTravelSegmentTask } from '@/shared/lib/tasks/individualTravelSegment';
import type { IndividualTravelSegmentParams } from '@/shared/lib/tasks/individualTravelSegment';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { LegacyStructureVideoConfig } from '@/shared/lib/tasks/travelBetweenImages/legacyStructureVideo';
import type { RunTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';

// ============================================================================
// Structure Video Config Builder (shared between SegmentRegenerateForm & SegmentSlotFormView)
// ============================================================================

interface StructureVideoInputs {
  structureVideoUrl?: string;
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  } | null;
}

/**
 * Build a StructureVideoConfig from structure video props + effective settings.
 * Returns null when required fields are missing.
 */
export function buildStructureVideoForTask(
  inputs: StructureVideoInputs,
  getSettingsForTaskCreation: () => Pick<SegmentSettings, 'structureTreatment' | 'structureMotionStrength' | 'structureUni3cEndPercent'>,
): LegacyStructureVideoConfig | null {
  const { structureVideoUrl, structureVideoType, structureVideoFrameRange, structureVideoDefaults } = inputs;
  if (!structureVideoUrl || !structureVideoType || !structureVideoFrameRange) {
    return null;
  }

  const effectiveSettings = getSettingsForTaskCreation();
  return {
    path: structureVideoUrl,
    start_frame: structureVideoFrameRange.segmentStart,
    end_frame: structureVideoFrameRange.segmentEnd,
    structure_type: structureVideoType,
    treatment: effectiveSettings.structureTreatment ?? structureVideoDefaults?.treatment ?? 'adjust',
    motion_strength: effectiveSettings.structureMotionStrength ?? structureVideoDefaults?.motionStrength ?? 1.2,
    uni3c_end_percent: effectiveSettings.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent ?? 0.1,
  };
}

// ============================================================================
// Segment Task Submission
// ============================================================================

/** Image context for the segment task */
interface SegmentTaskImageContext {
  startImageUrl?: string;
  endImageUrl?: string;
  startImageGenerationId?: string;
  endImageGenerationId?: string;
  startImageVariantId?: string;
  endImageVariantId?: string;
}

/** Task creation context */
interface SegmentTaskContext {
  projectId: string;
  shotId?: string;
  generationId?: string;
  childGenerationId?: string;
  segmentIndex: number;
  pairShotGenerationId?: string;
  projectResolution?: string;
  structureVideo: LegacyStructureVideoConfig | null;
}

/** Submission configuration */
interface SubmitSegmentTaskInput {
  /** Label for the incoming task placeholder (e.g. "Segment 3") */
  taskLabel: string;
  /** Component name for error context (e.g. "SegmentRegenerateForm") */
  errorContext: string;
  /** Get effective settings from the form hook */
  getSettings: () => SegmentSettings;
  /** Save persisted settings before task creation */
  saveSettings: () => Promise<boolean>;
  /** Whether to save settings (requires pairShotGenerationId) */
  shouldSaveSettings: boolean;
  /** Current enhance prompt ref value */
  shouldEnhance: boolean;
  /** Enhanced prompt already available from the form */
  enhancedPrompt?: string;
  /** Default num frames for enhancement */
  defaultNumFrames: number;
  /** Image context */
  images: SegmentTaskImageContext;
  /** Task context */
  task: SegmentTaskContext;
  /** Task placeholder runner (from useTaskPlaceholder) */
  run: RunTaskPlaceholder;
  /** React Query client for invalidation (for metadata save) */
  queryClient: QueryClient;
  /** Optional callback when generation starts (for optimistic UI) */
  onGenerateStarted?: () => void;
  /** Optional reporting hook for non-fatal side-effect failures. */
  onNonFatalError?: (step: SegmentSubmissionNonFatalStep, error: unknown) => void;
}

type SegmentSubmissionNonFatalStep =
  | 'enhance_prompt'
  | 'metadata_fetch'
  | 'metadata_update';

type BuildTaskParams = (prompt: string, enhancedPromptParam?: string) => IndividualTravelSegmentParams;

interface SubmitSegmentRuntime {
  errorContext: string;
  shouldSaveSettings: boolean;
  saveSettings: () => Promise<boolean>;
  effectiveSettings: SegmentSettings;
  task: SegmentTaskContext;
  queryClient: QueryClient;
  buildParams: BuildTaskParams;
  reportNonFatalError?: (step: SegmentSubmissionNonFatalStep, error: unknown) => void;
}

function buildSubmitParamsBuilder(
  effectiveSettings: SegmentSettings,
  task: SegmentTaskContext,
  images: SegmentTaskImageContext,
): BuildTaskParams {
  return (prompt: string, enhancedPromptParam?: string) => {
    return buildTaskParams(
      { ...effectiveSettings, prompt },
      {
        projectId: task.projectId,
        shotId: task.shotId,
        generationId: task.generationId,
        childGenerationId: task.childGenerationId,
        segmentIndex: task.segmentIndex,
        startImageUrl: images.startImageUrl ?? '',
        endImageUrl: images.endImageUrl,
        startImageGenerationId: images.startImageGenerationId,
        endImageGenerationId: images.endImageGenerationId,
        startImageVariantId: images.startImageVariantId,
        endImageVariantId: images.endImageVariantId,
        pairShotGenerationId: task.pairShotGenerationId,
        projectResolution: task.projectResolution,
        ...(enhancedPromptParam ? { enhancedPrompt: enhancedPromptParam } : {}),
        structureVideo: task.structureVideo,
      },
    );
  };
}

function applyPromptAffixes(settings: SegmentSettings, prompt: string): string {
  return joinPromptParts(
    [settings.textBeforePrompts, prompt, settings.textAfterPrompts],
    'segment_space',
  );
}

async function createTaskOrThrow(taskParams: ReturnType<BuildTaskParams>): Promise<string> {
  const result = await createIndividualTravelSegmentTask(taskParams);
  if (!result.task_id) {
    throw new Error('Failed to create task');
  }
  return result.task_id;
}

async function saveEnhancedPromptMetadata(
  runtime: SubmitSegmentRuntime,
  task: SegmentTaskContext,
  queryClient: QueryClient,
  enhancedPromptResult: string,
  promptToEnhance: string,
  basePrompt: string,
): Promise<void> {
  if (!task.pairShotGenerationId || enhancedPromptResult === promptToEnhance) {
    return;
  }

  const pairShotGenerationId = task.pairShotGenerationId;
  const { data: current, error: fetchError } = await supabase().from('shot_generations')
    .select('metadata')
    .eq('id', pairShotGenerationId)
    .single();

  if (fetchError) {
    runtime.reportNonFatalError?.('metadata_fetch', fetchError);
    normalizeAndPresentError(fetchError, {
      context: `${runtime.errorContext}.fetchMetadata`,
      showToast: false,
    });
    return;
  }

  const currentMetadata = (current?.metadata as Record<string, unknown>) || {};
  const { error: updateError } = await supabase().from('shot_generations')
    .update({
      metadata: {
        ...currentMetadata,
        enhanced_prompt: enhancedPromptResult,
        base_prompt_for_enhancement: basePrompt,
      },
    })
    .eq('id', pairShotGenerationId);

  if (updateError) {
    runtime.reportNonFatalError?.('metadata_update', updateError);
    normalizeAndPresentError(updateError, {
      context: `${runtime.errorContext}.saveEnhancedPrompt`,
      showToast: false,
    });
    return;
  }

  queryClient.invalidateQueries({ queryKey: queryKeys.segments.pairMetadata(pairShotGenerationId) });
}

async function maybeSaveSettings(runtime: SubmitSegmentRuntime): Promise<void> {
  if (runtime.shouldSaveSettings) {
    const didSave = await runtime.saveSettings();
    if (!didSave) {
      throw new Error('Failed to save segment settings before task submission');
    }
  }
}

async function submitStandardSegmentTask(runtime: SubmitSegmentRuntime): Promise<string> {
  await maybeSaveSettings(runtime);
  const finalPrompt = applyPromptAffixes(runtime.effectiveSettings, runtime.effectiveSettings.prompt?.trim() || '');
  const taskParams = runtime.buildParams(finalPrompt);
  return createTaskOrThrow(taskParams);
}

async function enhanceSegmentPrompt(
  runtime: SubmitSegmentRuntime,
  promptToEnhance: string,
  defaultNumFrames: number,
): Promise<string> {
  const { data: enhanceResult, error: enhanceError } = await supabase().functions.invoke('ai-prompt', {
    body: {
      task: 'enhance_segment_prompt',
      prompt: promptToEnhance,
      temperature: 0.7,
      numFrames: runtime.effectiveSettings.numFrames || defaultNumFrames,
    },
  });

  if (enhanceError) {
    runtime.reportNonFatalError?.('enhance_prompt', enhanceError);
    normalizeAndPresentError(enhanceError, {
      context: `${runtime.errorContext}.enhancePrompt`,
      showToast: false,
    });
  }

  return enhanceResult?.enhanced_prompt?.trim() || promptToEnhance;
}

async function submitEnhancedSegmentTask(
  runtime: SubmitSegmentRuntime,
  promptToEnhance: string,
  defaultNumFrames: number,
): Promise<string> {
  await maybeSaveSettings(runtime);

  const enhancedPromptResult = await enhanceSegmentPrompt(runtime, promptToEnhance, defaultNumFrames);
  const originalPrompt = runtime.effectiveSettings.prompt?.trim() || '';
  const originalPromptWithAffixes = applyPromptAffixes(runtime.effectiveSettings, originalPrompt);
  const enhancedPromptWithAffixes = applyPromptAffixes(runtime.effectiveSettings, enhancedPromptResult);

  await saveEnhancedPromptMetadata(
    runtime,
    runtime.task,
    runtime.queryClient,
    enhancedPromptResult,
    promptToEnhance,
    originalPrompt,
  );

  const taskParams = runtime.buildParams(originalPromptWithAffixes, enhancedPromptWithAffixes);
  return createTaskOrThrow(taskParams);
}

/**
 * Submit a segment task, handling both enhanced and standard prompt paths.
 * Uses the task placeholder runner for lifecycle management.
 * Returns immediately — task creation runs in the background (fire-and-forget).
 */
export function submitSegmentTask(input: SubmitSegmentTaskInput): void {
  const {
    taskLabel,
    errorContext,
    getSettings,
    saveSettings,
    shouldSaveSettings,
    shouldEnhance,
    enhancedPrompt,
    defaultNumFrames,
    images,
    task,
    run,
    queryClient,
    onGenerateStarted,
    onNonFatalError,
  } = input;

  const effectiveSettings = getSettings();
  const promptToEnhance = enhancedPrompt?.trim() || effectiveSettings.prompt?.trim() || '';
  const buildParams = buildSubmitParamsBuilder(effectiveSettings, task, images);

  // Notify parent for optimistic UI
  onGenerateStarted?.();

  const runtime: SubmitSegmentRuntime = {
    errorContext,
    shouldSaveSettings,
    saveSettings,
    effectiveSettings,
    task,
    queryClient,
    buildParams,
    reportNonFatalError: onNonFatalError,
  };

  // Fire and forget — run() handles add/resolve/refetch/remove/error lifecycle
  void run({
    taskType: 'individual_travel_segment',
    label: taskLabel,
    context: errorContext,
    toastTitle: 'Failed to create task',
    create: async () => {
      if (shouldEnhance && promptToEnhance) {
        return submitEnhancedSegmentTask(runtime, promptToEnhance, defaultNumFrames);
      }
      return submitStandardSegmentTask(runtime);
    },
  });
}
