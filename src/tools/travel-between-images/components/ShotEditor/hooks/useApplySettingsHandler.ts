/**
 * Stable Apply Settings Handler Hook
 * 
 * Provides a stable callback for applying settings from tasks that doesn't recreate
 * on every render, preventing unnecessary VideoItem re-renders.
 * 
 * Uses the ref pattern internally to access latest values without dependency issues.
 */

import { useCallback, useRef, useEffect } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import * as ApplySettingsService from '../services/applySettingsService';
import { GenerationRow, Shot } from '@/types/shots';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import type { SteerableMotionSettings } from '@/shared/types/steerableMotion';
import type { PhaseConfig } from '@/shared/types/phaseConfig';
import { invalidateGenerationsSync } from '@/shared/hooks/useGenerationInvalidation';
import type { VideoMetadata } from '@/shared/lib/videoUploader';
import type { AddImageToShotVariables } from '@/shared/hooks/shots/addImageToShotHelpers';
import type { PresetMetadata } from '@/shared/types/presetMetadata';
import type { Json } from '@/integrations/supabase/types';

interface ApplySettingsContext {
  // IDs
  projectId: string;
  selectedShotId: string;
  
  // Data
  simpleFilteredImages: GenerationRow[];
  selectedShot: Shot | undefined;
  availableLoras: LoraModel[];
  
  // State callbacks (from props)
  onBatchVideoPromptChange: (prompt: string) => void;
  onSteerableMotionSettingsChange: (settings: Partial<SteerableMotionSettings>) => void;
  onBatchVideoFramesChange: (frames: number) => void;
  onBatchVideoStepsChange: (steps: number) => void;
  onDimensionSourceChange?: (source: 'project' | 'firstImage' | 'custom') => void;
  onCustomWidthChange?: (width?: number) => void;
  onCustomHeightChange?: (height?: number) => void;
  onGenerationModeChange: (mode: 'batch' | 'timeline' | 'by-pair') => void;
  onAdvancedModeChange: (advanced: boolean) => void;
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
  onGenerationTypeModeChange: (mode: 'i2v' | 'vace') => void;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: PresetMetadata) => void;
  onPhasePresetRemove: () => void;
  onTurboModeChange: (turbo: boolean) => void;
  onEnhancePromptChange: (enhance: boolean) => void;
  onAmountOfMotionChange: (motion: number) => void;
  onTextBeforePromptsChange: (text: string) => void;
  onTextAfterPromptsChange: (text: string) => void;
  onStructureVideoInputChange: (
    videoPath: string | null,
    metadata: VideoMetadata | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth',
    resourceId?: string,
  ) => void;
  
  // Current values
  generationMode: 'batch' | 'timeline' | 'by-pair';
  generationTypeMode: 'i2v' | 'vace';
  advancedMode: boolean;
  motionMode: 'basic' | 'advanced';
  turboMode: boolean;
  enhancePrompt: boolean;
  amountOfMotion: number;
  textBeforePrompts: string;
  textAfterPrompts: string;
  batchVideoSteps: number;
  batchVideoFrames: number;
  steerableMotionSettings: SteerableMotionSettings;
  
  // Managers/Mutations
  loraManager: {
    setSelectedLoras?: (
      loras: Array<{ id: string; name: string; path: string; strength: number; [key: string]: unknown }>
    ) => void;
    handleAddLora: (lora: LoraModel, showToast: boolean, strength: number) => void;
  };
  addImageToShotMutation: { mutateAsync: (params: AddImageToShotVariables) => Promise<unknown> };
  removeImageFromShotMutation: {
    mutateAsync: (params: {
      shotId: string;
      shotGenerationId: string;
      projectId: string;
      shiftItems?: { id: string; newFrame: number }[];
    }) => Promise<unknown>;
  };
  updatePairPromptsByIndex: (pairIndex: number, prompt: string, negativePrompt: string) => Promise<void>;
  loadPositions: (opts?: { silent?: boolean; reason?: string }) => void | Promise<void>;
}

interface PairPromptSnapshotRow {
  id: string;
  timeline_frame: number | null;
  metadata: Json;
  generation?: {
    id?: string | null;
    type?: string | null;
    location?: string | null;
  } | null;
}

const SHOT_GENERATION_SNAPSHOT_SELECT = `
  id,
  timeline_frame,
  metadata,
  generation:generations!shot_generations_generation_id_generations_id_fk(id, type, location)
`;

function buildApplyContext(ctx: ApplySettingsContext): ApplySettingsService.ApplyContext {
  return {
    currentGenerationMode: ctx.generationMode,
    currentAdvancedMode: ctx.advancedMode,
    onBatchVideoPromptChange: ctx.onBatchVideoPromptChange,
    onSteerableMotionSettingsChange: ctx.onSteerableMotionSettingsChange,
    onBatchVideoFramesChange: ctx.onBatchVideoFramesChange,
    onBatchVideoStepsChange: ctx.onBatchVideoStepsChange,
    onGenerationModeChange: ctx.onGenerationModeChange,
    onAdvancedModeChange: ctx.onAdvancedModeChange,
    onMotionModeChange: ctx.onMotionModeChange,
    onGenerationTypeModeChange: ctx.onGenerationTypeModeChange,
    onPhaseConfigChange: ctx.onPhaseConfigChange,
    onPhasePresetSelect: ctx.onPhasePresetSelect,
    onPhasePresetRemove: ctx.onPhasePresetRemove,
    onTurboModeChange: ctx.onTurboModeChange,
    onEnhancePromptChange: ctx.onEnhancePromptChange,
    onTextBeforePromptsChange: ctx.onTextBeforePromptsChange,
    onTextAfterPromptsChange: ctx.onTextAfterPromptsChange,
    onAmountOfMotionChange: ctx.onAmountOfMotionChange,
    onStructureVideoInputChange: ctx.onStructureVideoInputChange,
    loraManager: ctx.loraManager as ApplySettingsService.ApplyContext['loraManager'],
    availableLoras: ctx.availableLoras,
    updatePairPromptsByIndex: ctx.updatePairPromptsByIndex,
    steerableMotionSettings: ctx.steerableMotionSettings,
    batchVideoFrames: ctx.batchVideoFrames,
    batchVideoSteps: ctx.batchVideoSteps,
    textBeforePrompts: ctx.textBeforePrompts,
    textAfterPrompts: ctx.textAfterPrompts,
    turboMode: ctx.turboMode,
    enhancePrompt: ctx.enhancePrompt,
    amountOfMotion: ctx.amountOfMotion,
    motionMode: ctx.motionMode,
    generationTypeMode: ctx.generationTypeMode,
  };
}

async function fetchTaskData(taskId: string) {
  try {
    return await ApplySettingsService.fetchTask(taskId);
  } catch (fetchError) {
    console.error('[ApplySettings] fetchTask failed:', fetchError);
    throw fetchError;
  }
}

async function fetchPairPromptSnapshot(shotId: string): Promise<PairPromptSnapshotRow[]> {
  const { data, error } = await supabase
    .from('shot_generations')
    .select(SHOT_GENERATION_SNAPSHOT_SELECT)
    .eq('shot_id', shotId)
    .not('timeline_frame', 'is', null)
    .order('timeline_frame', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[ApplySettings] Error fetching pair prompt snapshot:', error);
    return [];
  }

  return data || [];
}

async function loadPairPromptSnapshot(
  ctx: ApplySettingsContext,
  replaceImages: boolean,
  inputImages: string[],
  queryClient: ReturnType<typeof useQueryClient>,
): Promise<PairPromptSnapshotRow[]> {
  if (!ctx.selectedShot?.id) return [];

  if (replaceImages && inputImages.length > 0) {
    invalidateGenerationsSync(queryClient, ctx.selectedShot.id, {
      reason: 'apply-settings-from-task',
      scope: 'all',
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    await Promise.resolve(ctx.loadPositions({ silent: true }));
  }

  return fetchPairPromptSnapshot(ctx.selectedShot.id);
}

function preparePairPromptTargets(snapshot: PairPromptSnapshotRow[]) {
  return snapshot
    .filter(row => {
      const generation = row.generation;
      const isVideo = generation?.type === 'video' ||
        generation?.type === 'video_travel_output' ||
        generation?.location?.endsWith?.('.mp4');
      return !isVideo;
    })
    .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
}

async function applySettingsFromTask(
  taskId: string,
  replaceImages: boolean,
  inputImages: string[],
  ctx: ApplySettingsContext,
  queryClient: ReturnType<typeof useQueryClient>,
) {
  const taskData = await fetchTaskData(taskId);
  if (!taskData) {
    console.error('[ApplySettings] Task not found');
    return;
  }

  const settings = ApplySettingsService.extractSettings(taskData);
  const applyContext = buildApplyContext(ctx);

  await ApplySettingsService.replaceImagesIfRequested(
    settings,
    replaceImages,
    inputImages,
    ctx.selectedShot ?? null,
    ctx.projectId,
    ctx.simpleFilteredImages,
    ctx.addImageToShotMutation,
    ctx.removeImageFromShotMutation,
  );

  const pairPromptSnapshot = await loadPairPromptSnapshot(ctx, replaceImages, inputImages, queryClient);
  const pairPromptTargets = preparePairPromptTargets(pairPromptSnapshot);

  await ApplySettingsService.applyModelSettings(settings, applyContext);
  await ApplySettingsService.applyPromptSettings(settings, applyContext);
  await ApplySettingsService.applyGenerationSettings(settings, applyContext);
  await ApplySettingsService.applyModeSettings(settings, applyContext);
  await ApplySettingsService.applyAdvancedModeSettings(settings, applyContext);
  await ApplySettingsService.applyTextPromptAddons(settings, applyContext);
  await ApplySettingsService.applyMotionSettings(settings, applyContext);
  await ApplySettingsService.applyLoRAs(settings, applyContext);
  await ApplySettingsService.applyStructureVideo(settings, applyContext, taskData);
  await ApplySettingsService.applyFramePositionsToExistingImages(
    settings,
    ctx.selectedShot ?? null,
    ctx.simpleFilteredImages,
  );

  if (ctx.selectedShot?.id) {
    invalidateGenerationsSync(queryClient, ctx.selectedShot.id, {
      reason: 'apply-settings-force-reload',
      scope: 'all',
      delayMs: 200,
    });
  }

  await new Promise(resolve => setTimeout(resolve, 200));
  await Promise.resolve(ctx.loadPositions({ silent: true }));
}

export function useApplySettingsHandler(context: ApplySettingsContext) {
  const queryClient = useQueryClient();

  // Store all context values in a ref that updates silently
  const contextRef = useRef(context);
  
  // Update ref on every render (cheap, doesn't cause re-renders)
  useEffect(() => {
    contextRef.current = context;
  });
  
  // Return stable callback that reads from ref
  return useCallback(async (taskId: string, replaceImages: boolean, inputImages: string[]) => {
    const ctx = contextRef.current;
    const hasMissingIds = ctx.simpleFilteredImages.some(img => !img.id);
    if (hasMissingIds && replaceImages) {
      toast.error('Loading shot data... please try again in a moment.');
      return;
    }

    try {
      await applySettingsFromTask(taskId, replaceImages, inputImages, ctx, queryClient);
    } catch (error) {
      console.error('[ApplySettings] Failed to apply settings:', error);
      toast.error('Failed to apply settings from task');
      return;
    }
  }, [queryClient]); // stable identity
}
