import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useExtraLargeModal } from '@/shared/hooks/useModal';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { Shot } from '@/domains/generation/types';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useShotSettings } from '../hooks/settings/useShotSettings';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '@/shared/types/steerableMotion';
import { DEFAULT_PHASE_CONFIG } from '@/tools/travel-between-images/settings';
import {
  generateVideo,
} from './ShotEditor/services/generateVideoService';
import { buildBasicModeGenerationRequest as buildBasicModePhaseConfig } from './ShotEditor/services/generateVideo/modelPhase';
import type { StructureVideoConfigWithMetadata } from '@/shared/lib/tasks/travelBetweenImages';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { LoraSelectorModal } from '@/shared/components/LoraSelectorModal';
import { useShotImages } from '@/shared/hooks/useShotImages';
import { isPositioned, isVideoGeneration } from '@/shared/lib/typeGuards';
import { findClosestAspectRatio } from '@/shared/lib/media/aspectRatios';
import { useInvalidateGenerations } from '@/shared/hooks/invalidation/useGenerationInvalidation';
import { BUILTIN_DEFAULT_I2V_ID, BUILTIN_DEFAULT_VACE_ID, FEATURED_PRESET_IDS } from './MotionControl';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';
import { SETTINGS_IDS } from '@/shared/lib/settingsIds';
import type { ActiveLora } from '@/shared/types/lora';
import {
  VideoGenerationModalFormContent,
  VideoGenerationModalHeader,
  VideoGenerationModalLoadingContent,
} from './VideoGenerationModalSections';

interface VideoGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
  shot: Shot;
}

/**
 * Video Generation Modal - Opens a simplified video generation form for a shot
 * Always operates in Batch mode (not timeline mode)
 * Changes update the actual shot settings
 */
export const VideoGenerationModal: React.FC<VideoGenerationModalProps> = ({
  isOpen,
  onClose,
  shot,
}) => {
  const modal = useExtraLargeModal();
  const { selectedProjectId, projects } = useProject();
  const queryClient = useQueryClient();
  const invalidateGenerations = useInvalidateGenerations();
  const { navigateToShot } = useShotNavigation();

  const [isGenerating, setIsGenerating] = useState(false);
  const [justQueued, setJustQueued] = useState(false);
  const justQueuedTimeoutRef = useRef<number | null>(null);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  
  // UI settings (accelerated mode, random seed) - same pattern as ShotEditor
  const { settings: shotUISettings, update: updateShotUISettings } = useToolSettings<{
    acceleratedMode?: boolean;
    randomSeed?: boolean;
  }>(SETTINGS_IDS.TRAVEL_UI_STATE, {
    shotId: isOpen ? shot.id : undefined,
    enabled: isOpen && !!shot.id
  });
  
  const accelerated = shotUISettings?.acceleratedMode ?? false;
  const randomSeed = shotUISettings?.randomSeed ?? false;
  
  const setAccelerated = useCallback((value: boolean) => {
    updateShotUISettings('shot', { acceleratedMode: value });
  }, [updateShotUISettings]);
  
  const setRandomSeed = useCallback((value: boolean) => {
    updateShotUISettings('shot', { randomSeed: value });
  }, [updateShotUISettings]);
  
  // Use useShotSettings for all state management
  const {
    settings,
    status,
    updateField,
  } = useShotSettings(isOpen ? shot.id : null, selectedProjectId);
  
  // Available LoRAs
  const { data: availableLoras } = usePublicLoras();
  
  // Shot generations for positioned images
  const { data: shotGenerations, isLoading: generationsLoading } = useShotImages(
    isOpen ? shot.id : null,
    { disableRefetch: false }
  );
  
  const positionedImages = useMemo(() => {
    if (!shotGenerations) return [];
    return shotGenerations
      .filter(g => !isVideoGeneration(g) && isPositioned(g))
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
  }, [shotGenerations]);
  
  // Project aspect ratio
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio || '16:9';
  
  const effectiveAspectRatio = useMemo(() => {
    if (positionedImages.length > 0) {
      const firstImage = positionedImages[0];
      const metadata = firstImage.metadata || {};
      const width = typeof metadata.width === 'number' ? metadata.width : null;
      const height = typeof metadata.height === 'number' ? metadata.height : null;
      if (width && height) {
        const ratio = width / height;
        return findClosestAspectRatio(ratio);
      }
    }
    return projectAspectRatio;
  }, [positionedImages, projectAspectRatio]);
  
  // Selected LoRAs as ActiveLora[]
  const selectedLoras = useMemo<ActiveLora[]>(() => {
    return (settings.loras || []).map(lora => ({
      id: lora.id,
      name: lora.name,
      path: lora.path,
      strength: lora.strength,
      previewImageUrl: lora.previewImageUrl,
      trigger_word: lora.trigger_word,
    }));
  }, [settings.loras]);
  
  // Validate preset ID - only pass known preset IDs to prevent "not found" errors
  // Known presets are: builtin defaults + featured presets from the constant
  const validPresetId = useMemo(() => {
    const presetId = settings.selectedPhasePresetId;
    if (!presetId) return undefined;
    
    // Known preset IDs that won't cause "not found" errors
    const knownIds = [
      BUILTIN_DEFAULT_I2V_ID,
      BUILTIN_DEFAULT_VACE_ID,
      ...FEATURED_PRESET_IDS,
    ];
    
    if (knownIds.includes(presetId)) {
      return presetId;
    }
    
    // Unknown preset ID - clear it to show chip selector instead of "not found"
    return undefined;
  }, [settings.selectedPhasePresetId]);
  
  // LoRA handlers
  const handleAddLora = useCallback((lora: LoraModel) => {
    const newLora = {
      id: (lora['Model ID'] || '') as string,
      name: (lora.Name || '') as string,
      path: (lora.link || '') as string,
      strength: 1.0,
      previewImageUrl: lora['Preview Image URL'] as string | undefined,
      trigger_word: lora['Trigger Word'] as string | undefined,
    };
    const currentLoras = settings.loras || [];
    if (!currentLoras.some(l => l.id === newLora.id)) {
      updateField('loras', [...currentLoras, newLora]);
    }
    setIsLoraModalOpen(false);
  }, [settings.loras, updateField]);

  const handleRemoveLora = useCallback((loraId: string) => {
    updateField('loras', (settings.loras || []).filter(l => l.id !== loraId));
  }, [settings.loras, updateField]);

  const handleLoraStrengthChange = useCallback((loraId: string, strength: number) => {
    updateField('loras', (settings.loras || []).map(l =>
      l.id === loraId ? { ...l, strength } : l
    ));
  }, [settings.loras, updateField]);
  
  const handleAddTriggerWord = useCallback((_loraId: string, word: string) => {
    const currentPrompt = settings.prompt || '';
    if (!currentPrompt.includes(word)) {
      const newPrompt = currentPrompt ? `${currentPrompt}, ${word}` : word;
      updateField('prompt', newPrompt);
    }
  }, [settings.prompt, updateField]);
  
  
  // Handle generate
  const handleGenerate = useCallback(async () => {
    if (!selectedProjectId || !shot.id) {
      toast.error("No project or shot selected.");
      return;
    }
    if (positionedImages.length < 1) {
      toast.error("At least 1 positioned image is required.");
      return;
    }
    
    setIsGenerating(true);
    try {
      // Save generationMode as 'batch' when actually generating
      updateField('generationMode', 'batch');
      
      const userLoras = selectedLoras.map(l => ({ path: l.path, strength: l.strength }));
      const { phaseConfig: basicPhaseConfig } = buildBasicModePhaseConfig(
        settings.amountOfMotion || 50, userLoras
      );
      
      const motionMode = settings.motionMode || 'basic';
      const advancedMode = motionMode === 'advanced';
      const finalPhaseConfig = advancedMode ? (settings.phaseConfig || DEFAULT_PHASE_CONFIG) : basicPhaseConfig;
      const structureVideos: StructureVideoConfigWithMetadata[] = settings.structureVideo?.path
        ? [{
            path: settings.structureVideo.path,
            start_frame: 0,
            end_frame: settings.batchVideoFrames || 61,
            treatment: settings.structureVideo.treatment || 'adjust',
            motion_strength: settings.structureVideo.motionStrength ?? 1.0,
            structure_type: settings.structureVideo.structureType || 'uni3c',
            metadata: settings.structureVideo.metadata ?? null,
          }]
        : [];
      
      // Build merged steerable motion settings for extracting defaults
      const mergedSteerableSettings = { ...DEFAULT_STEERABLE_MOTION_SETTINGS, ...(settings.steerableMotionSettings || {}) };

      const result = await generateVideo({
        projectId: selectedProjectId,
        selectedShotId: shot.id,
        selectedShot: shot,
        queryClient,
        effectiveAspectRatio,
        generationMode: 'batch',
        // Grouped configs (snake_case matching API)
        promptConfig: {
          base_prompt: settings.prompt || '',
          enhance_prompt: settings.enhancePrompt,
          text_before_prompts: settings.textBeforePrompts,
          text_after_prompts: settings.textAfterPrompts,
          default_negative_prompt: mergedSteerableSettings.negative_prompt,
        },
        motionConfig: {
          amount_of_motion: settings.amountOfMotion || 50,
          motion_mode: motionMode,
          advanced_mode: advancedMode,
          phase_config: finalPhaseConfig,
          selected_phase_preset_id: settings.selectedPhasePresetId ?? undefined,
        },
        modelConfig: {
          seed: mergedSteerableSettings.seed,
          random_seed: randomSeed,
          turbo_mode: settings.turboMode || false,
          debug: mergedSteerableSettings.debug || false,
          generation_type_mode: settings.generationTypeMode || 'i2v',
        },
        structureVideos,
        batchVideoFrames: settings.batchVideoFrames || 61,
        selectedLoras: selectedLoras.map(l => ({ id: l.id, path: l.path, strength: l.strength, name: l.name })),
        variantNameParam: '',
        clearAllEnhancedPrompts: async () => {},
      });
      
      if (result.ok) {
        setJustQueued(true);
        if (justQueuedTimeoutRef.current) clearTimeout(justQueuedTimeoutRef.current);
        justQueuedTimeoutRef.current = window.setTimeout(() => {
          setJustQueued(false);
          justQueuedTimeoutRef.current = null;
          onClose();
        }, 1000);
        invalidateGenerations(shot.id, {
          reason: 'video-generation-modal-success',
          scope: 'all',
          includeProjectUnified: true,
          projectId: selectedProjectId ?? undefined
        });
      } else {
        toast.error(result.message || 'Failed to generate video');
      }
    } catch (error) {
      normalizeAndPresentError(error, { context: 'VideoGenerationModal', toastTitle: 'Failed to generate video' });
    } finally {
      setIsGenerating(false);
    }
  }, [selectedProjectId, shot, positionedImages, selectedLoras, settings, queryClient, effectiveAspectRatio, randomSeed, updateField, onClose, invalidateGenerations]);
  
  const handleNavigateToShot = useCallback(() => {
    onClose();
    navigateToShot(shot);
  }, [onClose, navigateToShot, shot]);
  
  useEffect(() => {
    return () => {
      if (justQueuedTimeoutRef.current) clearTimeout(justQueuedTimeoutRef.current);
    };
  }, []);
  
  const isLoading = (status !== 'ready' && status !== 'saving' && status !== 'error') || generationsLoading;
  const isDisabled = isGenerating || isLoading || positionedImages.length < 1;
  const selectedLorasForModal = useMemo(() => {
    return selectedLoras.flatMap((lora) => {
      const fullLora = availableLoras.find((model) => model['Model ID'] === lora.id);
      if (!fullLora) {
        return [];
      }
      return [{ ...fullLora, strength: lora.strength }];
    });
  }, [availableLoras, selectedLoras]);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoraModalOpen && onClose()}>
        <DialogContent
          className={modal.className}
          style={{ ...modal.style, maxWidth: '1000px' }}
        >
          <DialogHeader className={modal.headerClass}>
            <VideoGenerationModalHeader
              shotName={shot.name}
              positionedImages={positionedImages}
              onNavigateToShot={handleNavigateToShot}
            />
          </DialogHeader>
          
          <div className={`${modal.scrollClass} -mx-6 px-6 flex-1 min-h-0`}>
            {isLoading ? (
              <VideoGenerationModalLoadingContent />
            ) : (
              <VideoGenerationModalFormContent
                settings={settings}
                updateField={updateField}
                projects={projects}
                selectedProjectId={selectedProjectId}
                selectedLoras={selectedLoras}
                availableLoras={availableLoras}
                accelerated={accelerated}
                onAcceleratedChange={setAccelerated}
                randomSeed={randomSeed}
                onRandomSeedChange={setRandomSeed}
                imageCount={positionedImages.length}
                validPresetId={validPresetId}
                status={status}
                onOpenLoraModal={() => setIsLoraModalOpen(true)}
                onRemoveLora={handleRemoveLora}
                onLoraStrengthChange={handleLoraStrengthChange}
                onAddTriggerWord={(word) => handleAddTriggerWord('', word)}
              />
            )}
          </div>
          
          {/* Sticky footer with Generate button - always show, skeleton when loading */}
          <div className="flex-shrink-0 border-t border-zinc-700 bg-background px-6 py-4 -mx-6 -mb-6 flex justify-center">
            {isLoading ? (
              <Skeleton className="h-11 w-full max-w-md rounded-md" />
            ) : (
              <Button 
                size="retro-default" 
                className="w-full max-w-md" 
                variant={justQueued ? "success" : "retro"}
                onClick={handleGenerate}
                disabled={isDisabled}
              >
                {justQueued
                  ? "Submitted, closing modal..."
                  : isGenerating 
                    ? 'Creating Tasks...' 
                    : 'Generate Video'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      <LoraSelectorModal
        isOpen={isLoraModalOpen}
        onClose={() => setIsLoraModalOpen(false)}
        loras={availableLoras}
        onAddLora={handleAddLora}
        onRemoveLora={handleRemoveLora}
        onUpdateLoraStrength={handleLoraStrengthChange}
        selectedLoras={selectedLorasForModal}
        lora_type="Wan 2.1 14b"
      />
    </>
  );
};
