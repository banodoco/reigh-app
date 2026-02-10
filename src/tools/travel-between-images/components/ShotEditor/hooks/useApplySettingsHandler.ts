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
import { SteerableMotionSettings, PhaseConfig } from '../state/types';
import { invalidateGenerationsSync } from '@/shared/hooks/useGenerationInvalidation';

interface ApplySettingsContext {
  // IDs
  projectId: string;
  selectedShotId: string;
  
  // Data
  simpleFilteredImages: GenerationRow[];
  selectedShot: Shot | null;
  availableLoras: LoraModel[];
  
  // State callbacks (from props)
  onBatchVideoPromptChange: (prompt: string) => void;
  onSteerableMotionSettingsChange: (settings: Partial<SteerableMotionSettings>) => void;
  onBatchVideoFramesChange: (frames: number) => void;
  onBatchVideoStepsChange: (steps: number) => void;
  onDimensionSourceChange: (source: 'project' | 'firstImage' | 'custom') => void;
  onCustomWidthChange: (width?: number) => void;
  onCustomHeightChange: (height?: number) => void;
  onGenerationModeChange: (mode: 'batch' | 'timeline') => void;
  onAdvancedModeChange: (advanced: boolean) => void;
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
  onGenerationTypeModeChange: (mode: 'i2v' | 'vace') => void;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, promptPrefix?: string) => void;
  onPhasePresetRemove: () => void;
  onTurboModeChange: (turbo: boolean) => void;
  onEnhancePromptChange: (enhance: boolean) => void;
  onAmountOfMotionChange: (motion: number) => void;
  onTextBeforePromptsChange: (text: string) => void;
  onTextAfterPromptsChange: (text: string) => void;
  handleStructureVideoChange: (
    videoPath: string | null,
    metadata: Record<string, unknown> | null,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'uni3c' | 'flow' | 'canny' | 'depth'
  ) => void;
  
  // Current values
  generationMode: 'batch' | 'timeline';
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
    setSelectedLoras?: (loras: LoraModel[]) => void;
    handleAddLora: (lora: LoraModel, showToast: boolean, strength: number) => void;
  };
  addImageToShotMutation: { mutateAsync: (params: Record<string, unknown>) => Promise<unknown> };
  removeImageFromShotMutation: { mutateAsync: (params: Record<string, unknown>) => Promise<unknown> };
  updatePairPromptsByIndex: (pairIndex: number, prompt: string, negativePrompt: string) => Promise<void>;
  loadPositions: (opts?: { silent?: boolean; reason?: string }) => Promise<void>;
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
    const startTime = Date.now();
    
    // Get latest values from ref (no stale closures!)
    const ctx = contextRef.current;
    
    // ⚠️ SAFETY CHECK: Ensure data is loaded before mutations
    // We need id (shot_generations.id) for mutations
    const hasMissingIds = ctx.simpleFilteredImages.some(img => !img.id);
    if (hasMissingIds && replaceImages) {
      toast.error('Loading shot data... please try again in a moment.');
      return;
    }
    
    let pairPromptSnapshot: Array<{
      id: string;
      timeline_frame: number | null;
      metadata: Record<string, unknown> | null;
      generation?: {
        id?: string | null;
        type?: string | null;
        location?: string | null;
      } | null;
    }> = [];

    try {
      // Step 1: Fetch task from database
      let taskData;
      try {
        taskData = await ApplySettingsService.fetchTask(taskId);
      } catch (fetchError) {
        console.error('[ApplySettings] ❌ fetchTask threw error:', fetchError);
        throw fetchError;
      }
      
      if (!taskData) {
        console.error('[ApplySettings] ❌ Task not found (returned null/undefined)');
        return;
      }
      
      // Step 2: Extract all settings
      const settings = ApplySettingsService.extractSettings(taskData);
      
      // Step 3: Build apply context with all callbacks and current state
      const applyContext: ApplySettingsService.ApplyContext = {
        // Current state
        currentGenerationMode: ctx.generationMode,
        currentAdvancedMode: ctx.advancedMode,
        
        // Callbacks
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
        handleStructureVideoChange: ctx.handleStructureVideoChange,
        loraManager: ctx.loraManager,
        availableLoras: ctx.availableLoras,
        updatePairPromptsByIndex: ctx.updatePairPromptsByIndex,
        
        // Current values for comparison
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
      
      // Step 4: Apply all settings in sequence
      const results: ApplySettingsService.ApplyResult[] = [];
      
      // Replace images first if requested
      results.push(await ApplySettingsService.replaceImagesIfRequested(
        settings,
        replaceImages,
        inputImages,
        ctx.selectedShot,
        ctx.projectId,
        ctx.simpleFilteredImages,
        ctx.addImageToShotMutation,
        ctx.removeImageFromShotMutation
      ));
      
      // CRITICAL: Reload shotGenerations if images were replaced
      if (replaceImages && inputImages.length > 0) {
        
        try {
          // Invalidate cache using centralized hook
          if (ctx.selectedShot?.id) {
            invalidateGenerationsSync(queryClient, ctx.selectedShot.id, {
              reason: 'apply-settings-from-task',
              scope: 'all'
            });
          }
        } catch (invalidateError) {
          console.error('[ApplySettings] ❌ Error during query invalidation:', invalidateError);
          throw invalidateError;
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
        
        await ctx.loadPositions({ silent: true });
        
        // Query DB for fresh data
        const { data: freshGens, error: freshGensError } = await supabase
          .from('shot_generations')
          .select(`
            id,
            timeline_frame,
            metadata,
            generation:generations!shot_generations_generation_id_generations_id_fk(id, type, location)
          `)
          .eq('shot_id', ctx.selectedShot!.id)
          .not('timeline_frame', 'is', null)
          .order('timeline_frame', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });

        if (freshGensError) {
          console.error('[ApplySettings] Error fetching fresh data:', freshGensError);
        } else {
          pairPromptSnapshot = freshGens || [];
        }
      }

      // Get snapshot if not loaded yet
      if ((!pairPromptSnapshot || pairPromptSnapshot.length === 0) && ctx.selectedShot?.id) {
        const { data: snapshotRows } = await supabase
          .from('shot_generations')
          .select(`id, timeline_frame, metadata, generation:generations!shot_generations_generation_id_generations_id_fk(id, type, location)`)
          .eq('shot_id', ctx.selectedShot.id)
          .not('timeline_frame', 'is', null)
          .order('timeline_frame', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });
        
        pairPromptSnapshot = snapshotRows || [];
      }

      // Filter and sort snapshot
      let preparedPairPromptTargets = pairPromptSnapshot
        .filter(row => {
          const generation = row.generation;
          const isVideo = generation?.type === 'video' ||
                          generation?.type === 'video_travel_output' ||
                          generation?.location?.endsWith?.('.mp4');
          return !isVideo;
        })
        .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
      
      // Step 5: Apply settings (using actual exported functions)
      
      results.push(await ApplySettingsService.applyModelSettings(settings, applyContext));
      
      results.push(await ApplySettingsService.applyPromptSettings(settings, applyContext));
      
      results.push(await ApplySettingsService.applyGenerationSettings(settings, applyContext));
      
      results.push(await ApplySettingsService.applyModeSettings(settings, applyContext));
      
      results.push(await ApplySettingsService.applyAdvancedModeSettings(settings, applyContext));
      
      results.push(await ApplySettingsService.applyTextPromptAddons(settings, applyContext));
      
      results.push(await ApplySettingsService.applyMotionSettings(settings, applyContext));
      
      results.push(await ApplySettingsService.applyLoRAs(settings, applyContext));
      
      results.push(await ApplySettingsService.applyStructureVideo(settings, applyContext, taskData));
      
      // Apply pair prompts using frame positions
      results.push(await ApplySettingsService.applyFramePositionsToExistingImages(
        settings,
        preparedPairPromptTargets,
        ctx.selectedShot?.id || '',
        ctx.projectId,
        ctx.updatePairPromptsByIndex
      ));
      
      // Step 6: Log summary
      const successCount = results.filter(r => r.success).length;
      
      // Force reload
      if (ctx.selectedShot?.id) {
        invalidateGenerationsSync(queryClient, ctx.selectedShot.id, {
          reason: 'apply-settings-force-reload',
          scope: 'all',
          delayMs: 200
        });
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      await ctx.loadPositions({ silent: true });
      
      const duration = Date.now() - startTime;
      
    } catch (e) {
      const duration = Date.now() - startTime;
      console.error('[ApplySettings] ❌ Failed to apply settings:', e);
      console.error('[ApplySettings] Error details:', {
        error: e,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        duration: `${duration}ms`,
        failedAt: 'See logs above for last successful step'
      });
    }
  }, [queryClient]); // ✅ Only depends on queryClient (stable)
}

