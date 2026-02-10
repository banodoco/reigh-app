import React, { useEffect, useMemo, useRef, useCallback } from "react";
import { useUpdateShotImageOrder, useAddImageToShotWithoutPosition } from "@/shared/hooks/useShots";
import { useShotCreation } from "@/shared/hooks/useShotCreation";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useDeviceDetection } from "@/shared/hooks/useDeviceDetection";
import { Shot } from '@/types/shots';
import { FinalVideoSection } from "../FinalVideoSection";
import { usePanes } from '@/shared/contexts/PanesContext';
import { useTimelineCore } from "@/shared/hooks/useTimelineCore";
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { supabase } from '@/integrations/supabase/client';

// Import modular components and hooks
import { ShotEditorProps, GenerationsPaneSettings } from './state/types';
import { useShotEditorState } from './state/useShotEditorState';
import {
  useGenerationActions,
  useLoraSync,
  useApplySettingsHandler,
  useStructureVideo,
  useAudio,
  useOutputSelection,
  useNameEditing,
  useModeReadiness,
  useJoinSegmentsHandler,
  useShotActions,
  useGenerateBatch,
  useShotEditorSetup,
  useShotSettingsValue,
  useImageManagement,
  useSteerableMotionHandlers,
  useStructureVideoHandlers,
  useJoinSegmentsSetup,
} from './hooks';
// Direct context hooks (no more props fallback - context is always available)
import {
  usePromptSettings,
  useMotionSettings,
  useFrameSettings,
  usePhaseConfigSettings,
  useGenerationModeSettings,
  useSteerableMotionSettings,
  useLoraSettings,
  useVideoTravelSettings,
} from '@/tools/travel-between-images/providers';
import { ShotSettingsProvider } from './ShotSettingsContext';
import { HeaderSection, TimelineSection, ModalsSection, GenerationSection } from './sections';
import { useAddImageToShot, useRemoveImageFromShot } from '@/shared/hooks/useShots';
import { useRenderCount } from '@/shared/components/debug/RefactorMetricsCollector';
import { useSegmentOutputsForShot } from '../../hooks/useSegmentOutputsForShot';
import { useDemoteOrphanedVariants } from '@/shared/hooks/useDemoteOrphanedVariants';
import { handleError } from '@/shared/lib/errorHandler';

/**
 * ShotSettingsEditor - Main editor component for shot video generation settings
 *
 * This component manages:
 * - Video generation settings (prompts, frames, motion, LoRAs)
 * - Timeline image management
 * - Structure video configuration
 * - Join segments functionality
 *
 * Architecture (Context + Sections pattern):
 * - ShotSettingsContext: Shared state for all sections
 * - sections/HeaderSection: Header with navigation and name editing
 * - sections/ModalsSection: LoRA selector and settings modals
 * - sections/TimelineSection: Timeline/image editor (ready, not yet integrated)
 *
 * Hooks:
 * - state/useShotEditorState: Reducer pattern for local state
 * - hooks/useOutputSelection: Persisted output selection
 * - hooks/useModeReadiness: Loading states and transitions
 * - hooks/useNameEditing: Inline name editing
 * - hooks/useLoraSync: LoRA management with project presets
 * - hooks/useGenerationActions: Timeline mutations
 *
 * Future refactoring TODO:
 * - Extract GenerationSection (batch/join card ~500 lines)
 * - Integrate TimelineSection to reduce inline JSX
 * - Restructure ShotEditorProps (~90 props) into grouped objects
 *
 * @see docs/structure_detail/refactoring_patterns.md
 */
const ShotSettingsEditor: React.FC<ShotEditorProps> = ({
  // Core identifiers
  selectedShotId,
  projectId,
  optimisticShotData,
  // Callbacks
  onShotImagesUpdate,
  onBack,
  // onPairConfigChange, // Currently unused
  // onGenerateAllSegments, // Currently unused
  // Dimension settings (not in context yet)
  dimensionSource,
  onDimensionSourceChange,
  customWidth,
  onCustomWidthChange,
  customHeight,
  onCustomHeightChange,
  // Navigation
  onPreviousShot,
  onNextShot,
  // onPreviousShotNoScroll, // Currently unused
  // onNextShotNoScroll, // Currently unused
  hasPrevious,
  hasNext,
  onUpdateShotName,
  // Cache & video counts
  // getShotVideoCount, // Currently unused
  getFinalVideoCount,
  // invalidateVideoCountsCache, // Currently unused
  // Parent refs for floating UI
  headerContainerRef: parentHeaderRef,
  timelineSectionRef: parentTimelineRef,
  ctaContainerRef: parentCtaRef,
  onSelectionChange: parentOnSelectionChange,
  getGenerationDataRef: parentGetGenerationDataRef,
  generateVideoRef: parentGenerateVideoRef,
  nameClickRef: parentNameClickRef,
  // UI state
  isSticky,
  variantName: parentVariantName,
  onVariantNameChange: parentOnVariantNameChange,
  isGeneratingVideo: parentIsGeneratingVideo,
  videoJustQueued: parentVideoJustQueued,
  onDragStateChange,
}) => {
  // [RefactorMetrics] Track render count for baseline measurements
  useRenderCount('ShotEditor');

  // ============================================================================
  // SETTINGS FROM CONTEXT (VideoTravelSettingsProvider is required)
  // ============================================================================
  // All settings come from VideoTravelSettingsProvider context.
  // This component MUST be wrapped in VideoTravelSettingsProvider.

  const promptSettings = usePromptSettings();
  const motionSettings = useMotionSettings();
  const frameSettings = useFrameSettings();
  const phaseConfigSettings = usePhaseConfigSettings();
  const generationModeSettings = useGenerationModeSettings();
  const steerableMotionSettingsFromContext = useSteerableMotionSettings();
  const loraSettingsFromContext = useLoraSettings();
  const { isLoading: settingsLoadingFromContext } = useVideoTravelSettings();
  // Note: useSettingsSave provides onBlurSave but it's handled by context consumers

  // Derive advancedMode from motionMode - single source of truth
  const advancedMode = motionSettings.motionMode === 'advanced';

  // ============================================================================
  // SETUP HOOK - Shot resolution, image queries, and stability refs
  // ============================================================================
  const {
    selectedShot,
    shots,
    selectedProjectId,
    projects,
    effectiveAspectRatio,
    allShotImages,
    timelineImages,
    unpositionedImages,
    videoOutputs,
    contextImages,
    isLoadingFullImages,
    initialParentGenerations,
    refs: { selectedShotRef, projectIdRef, allShotImagesRef, batchVideoFramesRef },
  } = useShotEditorSetup({
    selectedShotId,
    projectId,
    optimisticShotData,
    batchVideoFrames: frameSettings.batchVideoFrames,
  });

  // Call all hooks first (Rules of Hooks)
  const queryClient = useQueryClient();

  // Navigation hooks
  const { setCurrentShotId } = useCurrentShot(); // For navigating to shots
  const { navigateToShot } = useShotNavigation(); // For proper navigation with URL update

  // Shot management hooks for external generation viewing
  const { createShot } = useShotCreation();
  const { mutateAsync: addToShotMutation } = useAddImageToShot();
  const { mutateAsync: addToShotWithoutPositionMutation } = useAddImageToShotWithoutPosition();

  // Orphaned variant detection - demotes videos when source images change
  const { demoteOrphanedVariants } = useDemoteOrphanedVariants();

  // 🎯 PERF FIX: Refs for mutation functions to prevent callback recreation
  // React Query mutations change reference on state changes (idle → pending → success)
  const createShotRef = useRef(createShot);
  createShotRef.current = createShot;
  const addToShotMutationRef = useRef(addToShotMutation);
  addToShotMutationRef.current = addToShotMutation;
  const addToShotWithoutPositionMutationRef = useRef(addToShotWithoutPositionMutation);
  addToShotWithoutPositionMutationRef.current = addToShotWithoutPositionMutation;

  // 🎯 PERF FIX: Refs for parent callbacks to prevent child callback recreation
  const parentOnSelectionChangeRef = useRef(parentOnSelectionChange);
  parentOnSelectionChangeRef.current = parentOnSelectionChange;

  // Forward drag state to parent
  const handleDragStateChange = useCallback((isDragging: boolean) => {
    onDragStateChange?.(isDragging);
  }, [onDragStateChange]);

  // Note: effectiveAspectRatio is provided by useShotEditorSetup

  // Structure video management (extracted to hook)
  const {
    // New grouped config (preferred for generateVideo)
    structureVideoConfig,
    setStructureVideoConfig,
    // Legacy individual accessors (for UI components that haven't migrated)
    structureVideoPath,
    structureVideoMetadata,
    structureVideoTreatment,
    structureVideoMotionStrength,
    structureVideoType,
    handleStructureVideoChange,
    isLoading: isStructureVideoSettingsLoading,
    // NEW: Multi-video array support
    structureVideos,
    addStructureVideo,
    updateStructureVideo,
    removeStructureVideo,
    setStructureVideos,
  } = useStructureVideo({
    projectId,
    shotId: selectedShot?.id,
  });

  // Structure video handlers (extracted hook) - includes auto mode switching
  const {
    handleUni3cEndPercentChange,
    handleStructureVideoMotionStrengthChange,
    handleStructureTypeChangeFromMotionControl,
    handleStructureVideoChangeWithModeSwitch,
  } = useStructureVideoHandlers({
    structureVideoConfig,
    setStructureVideoConfig,
    structureVideoPath,
    structureVideoMetadata,
    structureVideoTreatment,
    structureVideoMotionStrength,
    structureVideoType,
    handleStructureVideoChange,
    structureVideos,
    updateStructureVideo,
    generationTypeMode: phaseConfigSettings.generationTypeMode,
    setGenerationTypeMode: phaseConfigSettings.setGenerationTypeMode,
  });

  // Audio management (extracted to hook)
  const {
    audioUrl,
    audioMetadata,
    handleAudioChange,
    isLoading: isAudioSettingsLoading,
  } = useAudio({
    projectId,
    shotId: selectedShot?.id,
  });

  // Note: Image queries (useShotImages, useTimelineImages, etc.) are now
  // handled by useShotEditorSetup. Values available: allShotImages, timelineImages,
  // unpositionedImages, videoOutputs, contextImages, isLoadingFullImages, initialParentGenerations

  // Query for the most recent video generation for this shot (for preset sample)
  const { data: lastVideoGeneration } = useQuery({
    queryKey: queryKeys.generations.lastVideo(selectedShotId!),
    queryFn: async () => {
      if (!selectedShotId) return null;
      
      // Query through shot_generations join table since shot_data column doesn't exist on generations
      const { data, error } = await supabase
        .from('shot_generations')
        .select(`
          generation:generations!shot_generations_generation_id_generations_id_fk (
            id,
            location,
            type,
            created_at
          )
        `)
        .eq('shot_id', selectedShotId);
      
      if (error) {
        return null;
      }
      
      // Filter to video types and sort by created_at in JS
      // Supabase returns joined relations as unknown-shape objects
      const asRecord = (gen: unknown): Record<string, unknown> | null =>
        gen && typeof gen === 'object' ? gen as Record<string, unknown> : null;

      const videos = (data || [])
        .filter(shotGen => {
          const gen = asRecord(shotGen.generation);
          return typeof gen?.type === 'string' && gen.type.includes('video');
        })
        .sort((a, b) => {
          const genA = asRecord(a.generation);
          const genB = asRecord(b.generation);
          const dateA = new Date((genA?.created_at as string) || 0).getTime();
          const dateB = new Date((genB?.created_at as string) || 0).getTime();
          return dateB - dateA; // Descending
        });

      const firstGen = asRecord(videos[0]?.generation);
      return firstGen?.location as string | null ?? null;
    },
    enabled: !!selectedShotId,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Note: Image selectors (timelineImages, unpositionedImages, videoOutputs, etc.) and
  // stability refs (allShotImagesRef, batchVideoFramesRef) now come from useShotEditorSetup

  const updateShotImageOrderMutation = useUpdateShotImageOrder();
  
  // Flag to skip next prop sync after successful operations
  const skipNextSyncRef = useRef(false);
  
  // Shot-specific UI settings stored in database
  const { 
    settings: shotUISettings, 
    update: updateShotUISettings,
    isLoading: isShotUISettingsLoading 
  } = useToolSettings<{
    acceleratedMode?: boolean;
    randomSeed?: boolean;
  }>('travel-ui-state', { 
    projectId: selectedProjectId, 
    shotId: selectedShot?.id,
    enabled: !!selectedShot?.id 
  });

  // Get pair prompts data for checking if all pairs have prompts
  // Uses useTimelineCore for centralized position management
  const { clearAllEnhancedPrompts, updatePairPromptsByIndex, refetch: loadPositions } = useTimelineCore(selectedShotId);
  
  // Wrap prompt change to also clear all enhanced prompts when base prompt changes
  const handleBatchVideoPromptChangeWithClear = useCallback(async (newPrompt: string) => {

    // First update the base prompt (now via context)
    promptSettings.setPrompt(newPrompt);

    // Then clear all enhanced prompts for the shot
    try {
      await clearAllEnhancedPrompts();
    } catch (error) {
      handleError(error, { context: 'PromptClearLog', showToast: false });
    }
  }, [promptSettings.setPrompt, promptSettings.prompt, clearAllEnhancedPrompts, selectedShotId]);

  const isMobile = useIsMobile();

  // Device detection (extracted to shared hook)
  const { isPhone, mobileColumns } = useDeviceDetection();

  // Adjust columns based on aspect ratio - portrait images are narrower so we can fit more
  const aspectAdjustedColumns = useMemo(() => {
    if (!effectiveAspectRatio) return mobileColumns;

    const [w, h] = effectiveAspectRatio.split(':').map(Number);
    if (!w || !h) return mobileColumns;

    const ratio = w / h;

    // Portrait (ratio < 1): images are narrow, fit more columns
    // Landscape (ratio > 1): images are wide, fit fewer columns
    // Square (ratio = 1): use base columns

    if (ratio < 0.7) {
      // Very portrait (e.g., 9:16 = 0.56) - add 2 columns
      return Math.min(mobileColumns + 2, 8) as 2 | 3 | 4 | 6;
    } else if (ratio < 1) {
      // Slightly portrait (e.g., 3:4 = 0.75) - add 1 column
      return Math.min(mobileColumns + 1, 7) as 2 | 3 | 4 | 6;
    } else if (ratio > 1.5) {
      // Very landscape (e.g., 16:9 = 1.78) - reduce by 1 column (min 2)
      return Math.max(mobileColumns - 1, 2) as 2 | 3 | 4 | 6;
    }

    // Square or slightly landscape - use base columns
    return mobileColumns;
  }, [mobileColumns, effectiveAspectRatio]);
  const { setIsGenerationsPaneLocked } = usePanes();

  // Effective generation mode: phones always use batch mode locally (even if saved setting is timeline)
  // This ensures Duration per Pair slider works on mobile
  const effectiveGenerationMode = isPhone ? 'batch' : generationModeSettings.generationMode;

  // Use shots.settings to store GenerationsPane settings (shared with useGenerationsPageLogic)
  const { update: updateShotGenerationsPaneSettings } = useToolSettings<GenerationsPaneSettings>('generations-pane', {
    shotId: selectedShotId,
    enabled: !!selectedShotId
  });

  // Use the new modular state management
  const { state, actions } = useShotEditorState();

  // 🎯 PERF FIX: Refs for context/hook values to prevent callback recreation
  const setIsGenerationsPaneLockedRef = useRef(setIsGenerationsPaneLocked);
  setIsGenerationsPaneLockedRef.current = setIsGenerationsPaneLocked;
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const updateShotGenerationsPaneSettingsRef = useRef(updateShotGenerationsPaneSettings);
  updateShotGenerationsPaneSettingsRef.current = updateShotGenerationsPaneSettings;

  // ============================================================================
  // REFS FOR PARENT-CONTROLLED FLOATING UI
  // ============================================================================
  // Other local refs
  const centerSectionRef = useRef<HTMLDivElement>(null);
  const videoGalleryRef = useRef<HTMLDivElement>(null);
  const generateVideosCardRef = useRef<HTMLDivElement>(null);
  const joinSegmentsSectionRef = useRef<HTMLDivElement>(null);
  const swapButtonRef = useRef<HTMLButtonElement>(null);

  // STICKY HEADER & FLOATING CTA LOGIC MOVED TO PARENT (VideoTravelToolPage)
  // Parent manages:
  // - Scroll detection via useStickyHeader and useFloatingCTA hooks
  // - Rendering of floating elements
  // - Element visibility and positioning
  // - Click handlers for floating UI that scroll and trigger actions

  // Use the LoRA sync hook - now using context values
  // These values come from VideoTravelSettingsProvider via bridge hooks
  const { loraManager } = useLoraSync({
    selectedLoras: loraSettingsFromContext.selectedLoras,
    onSelectedLorasChange: loraSettingsFromContext.setSelectedLoras,
    projectId: selectedProjectId,
    availableLoras: loraSettingsFromContext.availableLoras,
    batchVideoPrompt: promptSettings.prompt,
    onBatchVideoPromptChange: promptSettings.setPrompt,
  });
  
  // LoRA loading state - set to false since the new hook doesn't have async loading
  // (the old implementation had shot-specific LoRA settings from database)
  const isShotLoraSettingsLoading = false;

  // ============================================================================
  // JOIN SEGMENTS SETUP (extracted hook)
  // ============================================================================
  const {
    joinSettings,
    joinPrompt,
    joinNegativePrompt,
    joinContextFrames,
    joinGapFrames,
    joinReplaceMode,
    joinKeepBridgingImages,
    joinEnhancePrompt,
    joinModel,
    joinNumInferenceSteps,
    joinGuidanceScale,
    joinSeed,
    joinMotionMode,
    joinPhaseConfig,
    joinSelectedPhasePresetId,
    joinRandomSeed,
    joinPriority,
    joinUseInputVideoResolution,
    joinUseInputVideoFps,
    joinNoisedInputVideo,
    joinLoopFirstClip,
    generateMode,
    joinSelectedLoras,
    stitchAfterGenerate,
    setGenerateMode,
    toggleGenerateModePreserveScroll,
    joinSettingsForHook,
    joinLoraManager,
  } = useJoinSegmentsSetup({
    selectedShotId,
    projectId,
    swapButtonRef,
  });

  // Note: useJoinSegmentsHandler is called AFTER useSegmentOutputsForShot (below)
  // since it needs joinSegmentSlots and joinSelectedParent from that hook

  // ============================================================================
  // SHARED OUTPUT SELECTION STATE (PERSISTED PER SHOT)
  // ============================================================================
  const {
    selectedOutputId,
    setSelectedOutputId,
    isReady: outputSelectionReady,
  } = useOutputSelection({
    projectId: selectedProjectId,
    shotId: selectedShot?.id,
  });

  // Get properly ordered segment outputs from useSegmentOutputsForShot
  // This hook correctly orders videos by their pair_shot_generation_id → timeline position
  // Unlike videoOutputs which requires position field (never set for videos)
  // Uses controlled selectedOutputId so selection is shared with FinalVideoSection and SegmentOutputStrip
  // IMPORTANT: Only pass controlled state AFTER persistence has loaded to avoid race conditions
  // outputSelectionReady comes from useOutputSelection hook
  const {
    segmentSlots: joinSegmentSlots,
    segments: joinSegments,
    selectedParent: joinSelectedParent,
    parentGenerations,
    segmentProgress,
    isLoading: isSegmentOutputsLoading,
  } = useSegmentOutputsForShot(
    selectedShotId,
    projectId,
    undefined, // localShotGenPositions not needed here
    outputSelectionReady ? selectedOutputId : undefined,
    outputSelectionReady ? setSelectedOutputId : undefined
  );

  // Auto-select first parent generation when controlled mode is ready but no selection exists
  useEffect(() => {

    if (!outputSelectionReady) {
      return;
    }
    if (parentGenerations.length === 0) {
      return;
    }

    // Select first if nothing selected or current selection doesn't exist
    const selectionExists = selectedOutputId && parentGenerations.some(p => p.id === selectedOutputId);
    if (!selectionExists) {
      setSelectedOutputId(parentGenerations[0].id);
    }
  }, [outputSelectionReady, parentGenerations, selectedOutputId, setSelectedOutputId]);

  // Join segments handler (extracted hook)
  // Provides: isJoiningClips, joinClipsSuccess, joinValidationData, handleJoinSegments, handleRestoreJoinDefaults
  const {
    isJoiningClips,
    joinClipsSuccess,
    joinValidationData,
    handleJoinSegments,
    handleRestoreJoinDefaults,
  } = useJoinSegmentsHandler({
    projectId,
    selectedProjectId,
    selectedShotId,
    effectiveAspectRatio,
    audioUrl,
    joinSegmentSlots,
    joinSelectedParent,
    joinLoraManager,
    joinSettings: joinSettingsForHook,
  });

  // [JoinSegmentsDebug] Explain why the "Join Segments" UI is (or isn't) available.
  // Now uses useSegmentOutputsForShot which correctly orders videos by pair position.
  useEffect(() => {
    if (!selectedShotId) return;

    const readySegments = joinSegments.filter(seg => Boolean(seg.location));

    // Sample segments to see their state
    const sample = joinSegments.slice(0, 8).map(seg => {
      const segParams = seg.params as Record<string, unknown> | null;
      // Prefer FK column, fall back to params for legacy data
      const individualSegParams = segParams?.individual_segment_params as Record<string, unknown> | undefined;
      const pairShotGenId = seg.pair_shot_generation_id
        || (individualSegParams?.pair_shot_generation_id as string | undefined)
        || (segParams?.pair_shot_generation_id as string | undefined);
      return {
        id: seg.id?.substring(0, 8),
        type: seg.type,
        hasLocation: Boolean(seg.location),
        pairShotGenId: pairShotGenId?.substring(0, 8) || null,
        segmentIndex: segParams?.segment_index,
        childOrder: seg.child_order,
      };
    });

  }, [selectedShotId, joinSegments, joinSegmentSlots, joinSelectedParent, joinValidationData]);

  // Expose shot-specific generation data to parent via mutable ref
  // This is called by parent (VideoTravelToolPage) when generating video
  useEffect(() => {
    if (parentGetGenerationDataRef) {
      // Store the callback that returns current generation data
      parentGetGenerationDataRef.current = () => {
        return {
          structureVideo: {
            path: structureVideoPath,
            type: structureVideoType === 'flow' ? null : structureVideoType,
            treatment: structureVideoTreatment === 'adjust' ? 'image' : structureVideoTreatment === 'clip' ? 'video' : 'image',
            motionStrength: structureVideoMotionStrength
          },
          aspectRatio: effectiveAspectRatio,
          loras: loraManager.selectedLoras.map(lora => ({
            id: lora.id,
            path: lora.path,
            strength: parseFloat(lora.strength?.toString() ?? '0') || 0.0,
            name: lora.name
          })),
          clearEnhancedPrompts: clearAllEnhancedPrompts
        };
      };
    }
  }, [
    parentGetGenerationDataRef,
    structureVideoPath,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength,
    effectiveAspectRatio,
    loraManager.selectedLoras,
    clearAllEnhancedPrompts
  ]);

  // Use generation actions hook
  const generationActions = useGenerationActions({
    state,
    actions,
    selectedShot: selectedShot || {} as Shot,
    projectId,
    batchVideoFrames: frameSettings.batchVideoFrames,
    onShotImagesUpdate,
    orderedShotImages: allShotImages, // Pass all images; hook uses ref for stability
    skipNextSyncRef,
  });

  // REMOVED: Local optimistic list sync - no longer needed with two-phase loading

  // Function to update GenerationsPane settings for current shot
  // 🎯 STABILITY FIX: Wrap in useCallback to prevent recreation on every render
  const selectedShotIdRef = useRef(selectedShotId);
  selectedShotIdRef.current = selectedShotId;
  
  // 🎯 PERF FIX: Uses ref to prevent callback recreation
  const updateGenerationsPaneSettings = useCallback((settings: Partial<GenerationsPaneSettings>) => {
    const shotId = selectedShotIdRef.current;
    if (shotId) {
      const updatedSettings: GenerationsPaneSettings = {
        selectedShotFilter: settings.selectedShotFilter || shotId,
        excludePositioned: settings.excludePositioned ?? true,
        userHasCustomized: true // Mark as customized since this is being called programmatically
      };
      updateShotGenerationsPaneSettingsRef.current('shot', updatedSettings);
    }
  }, []); // Uses refs for all dependencies

  // ============================================================================
  // SHOT ACTIONS (extracted to useShotActions hook)
  // ============================================================================
  const shotActions = useShotActions({
    projectIdRef,
    selectedShotRef,
    allShotImagesRef,
    addToShotMutationRef,
    addToShotWithoutPositionMutationRef,
    createShotRef,
    setIsGenerationsPaneLockedRef,
    shots,
    navigateToShot,
    setCurrentShotId,
    updateGenerationsPaneSettings,
    isMobile,
    selectedShot,
  });

  // ============================================================================
  // MODE READINESS (extracted to useModeReadiness hook)
  // ============================================================================
  useModeReadiness({
    selectedShot,
    contextImages,
    settingsLoading: settingsLoadingFromContext || false,
    isShotUISettingsLoading,
    isShotLoraSettingsLoading,
    isPhone,
    isMobile,
    generationMode: generationModeSettings.generationMode || 'batch',
    state,
    actions,
    onGenerationModeChange: generationModeSettings.setGenerationMode,
  });

  // Accelerated mode and random seed from database settings
  const accelerated = shotUISettings?.acceleratedMode ?? false;
  const randomSeed = shotUISettings?.randomSeed ?? false;

  // Steerable motion handlers (extracted hook)
  const {
    handleRandomSeedChange,
    handleAcceleratedChange,
    handleStepsChange,
  } = useSteerableMotionHandlers({
    accelerated,
    randomSeed,
    turboMode: motionSettings.turboMode,
    steerableMotionSettings: steerableMotionSettingsFromContext.steerableMotionSettings,
    isShotUISettingsLoading,
    settingsLoadingFromContext,
    updateShotUISettings,
    setSteerableMotionSettings: steerableMotionSettingsFromContext.setSteerableMotionSettings,
    setSteps: frameSettings.setSteps,
    setShowStepsNotification: actions.setShowStepsNotification,
    selectedShotId: selectedShot?.id,
  });

  // ============================================================================
  // NAME EDITING (extracted to useNameEditing hook)
  // ============================================================================
  const {
    handleNameClick,
    handleNameSave,
    handleNameCancel,
    handleNameKeyDown,
  } = useNameEditing({
    selectedShot,
    state: { isEditingName: state.isEditingName, editingName: state.editingName },
    actions,
    onUpdateShotName,
  });

  // Alias for backwards compatibility with existing code
  const simpleFilteredImages = timelineImages;

  // Auto-disable turbo mode when there are more than 2 images
  useEffect(() => {
    if (simpleFilteredImages.length > 2 && motionSettings.turboMode) {
      motionSettings.setTurboMode(false);
    }
  }, [simpleFilteredImages.length, motionSettings.turboMode, motionSettings.setTurboMode]);

  // All modes are always available - no restrictions based on image count
  // Note: Model selection is handled by useGenerateBatch hook

  // Mutations for applying settings/images from a task
  const addImageToShotMutation = useAddImageToShot();
  const removeImageFromShotMutation = useRemoveImageFromShot();

  // Apply settings from a completed video task (for "use these settings" feature)
  const applySettingsFromTask = useApplySettingsHandler({
    projectId,
    selectedShotId: selectedShot?.id || '',
    simpleFilteredImages,
    selectedShot,
    availableLoras: loraSettingsFromContext.availableLoras,
    onBatchVideoPromptChange: promptSettings.setPrompt,
    onSteerableMotionSettingsChange: steerableMotionSettingsFromContext.setSteerableMotionSettings,
    onBatchVideoFramesChange: frameSettings.setFrames,
    // onBatchVideoContextChange, // Removed
    onBatchVideoStepsChange: frameSettings.setSteps,
    onDimensionSourceChange,
    onCustomWidthChange,
    onCustomHeightChange,
    onGenerationModeChange: generationModeSettings.setGenerationMode,
    // onAdvancedModeChange now derived - convert to motionMode change
    onAdvancedModeChange: (advanced: boolean) => motionSettings.setMotionMode(advanced ? 'advanced' : 'basic'),
    onMotionModeChange: motionSettings.setMotionMode,
    onGenerationTypeModeChange: phaseConfigSettings.setGenerationTypeMode,
    onPhaseConfigChange: phaseConfigSettings.setPhaseConfig,
    onPhasePresetSelect: phaseConfigSettings.selectPreset,
    onPhasePresetRemove: phaseConfigSettings.removePreset,
    onTurboModeChange: motionSettings.setTurboMode,
    onEnhancePromptChange: promptSettings.setEnhancePrompt,
    onAmountOfMotionChange: motionSettings.setAmountOfMotion,
    onTextBeforePromptsChange: promptSettings.setTextBeforePrompts,
    onTextAfterPromptsChange: promptSettings.setTextAfterPrompts,
    handleStructureVideoChange,
    generationMode: generationModeSettings.generationMode,
    generationTypeMode: phaseConfigSettings.generationTypeMode,
    advancedMode: phaseConfigSettings.advancedMode,
    motionMode: motionSettings.motionMode,
    turboMode: motionSettings.turboMode,
    enhancePrompt: promptSettings.enhancePrompt,
    amountOfMotion: motionSettings.amountOfMotion,
    textBeforePrompts: promptSettings.textBeforePrompts,
    textAfterPrompts: promptSettings.textAfterPrompts,
    batchVideoSteps: frameSettings.batchVideoSteps,
    batchVideoFrames: frameSettings.batchVideoFrames,
    // batchVideoContext, // Removed
    steerableMotionSettings: steerableMotionSettingsFromContext.steerableMotionSettings,
    loraManager,
    addImageToShotMutation,
    removeImageFromShotMutation,
    updatePairPromptsByIndex,
    loadPositions,
  });

  // Image management (extracted hook) - handles delete, reorder, pending positions
  const {
    isClearingFinalVideo,
    handleDeleteFinalVideo,
    handleReorderImagesInShot,
    handlePendingPositionApplied,
  } = useImageManagement({
    queryClient,
    selectedShotRef,
    projectIdRef,
    allShotImagesRef,
    batchVideoFramesRef,
    updateShotImageOrderMutation,
    demoteOrphanedVariants,
    actionsRef,
    pendingFramePositions: state.pendingFramePositions,
  });

  // Image upload handler (accepts File[] from ImageUploadActions)
  const handleImageUpload = useCallback(async (files: File[]) => {
    if (files.length > 0) {
      await generationActions.handleBatchImageDrop(files);
    }
  }, [generationActions]);

  // Video generation (extracted hook)
  const {
    handleGenerateBatch,
    isSteerableMotionEnqueuing,
    steerableMotionJustQueued,
    isGenerationDisabled,
  } = useGenerateBatch({
    projectId,
    selectedProjectId,
    selectedShotId,
    selectedShot,
    queryClient,
    onShotImagesUpdate,
    effectiveAspectRatio,
    generationMode: generationModeSettings.generationMode,
    // Prompt config
    prompt: promptSettings.prompt,
    enhancePrompt: promptSettings.enhancePrompt,
    textBeforePrompts: promptSettings.textBeforePrompts,
    textAfterPrompts: promptSettings.textAfterPrompts,
    negativePrompt: promptSettings.negativePrompt,
    // Motion config
    amountOfMotion: motionSettings.amountOfMotion,
    motionMode: motionSettings.motionMode || 'basic',
    advancedMode,
    phaseConfig: phaseConfigSettings.phaseConfig,
    selectedPhasePresetId: phaseConfigSettings.selectedPhasePresetId,
    // Model config
    steerableMotionSettings: steerableMotionSettingsFromContext.steerableMotionSettings,
    randomSeed,
    turboMode: motionSettings.turboMode,
    generationTypeMode: phaseConfigSettings.generationTypeMode,
    smoothContinuations: motionSettings.smoothContinuations,
    // Frame settings
    batchVideoFrames: frameSettings.batchVideoFrames,
    // LoRAs
    selectedLoras: loraManager.selectedLoras,
    // Structure video
    structureVideoConfig,
    structureVideos,
    // Clear prompts callback
    clearAllEnhancedPrompts,
    // Output selection
    selectedOutputId,
    // Stitch config
    stitchAfterGenerate,
    joinContextFrames,
    joinGapFrames,
    joinReplaceMode,
    joinKeepBridgingImages,
    joinPrompt,
    joinNegativePrompt,
    joinEnhancePrompt,
    joinModel,
    joinNumInferenceSteps,
    joinGuidanceScale,
    joinSeed,
    joinRandomSeed,
    joinMotionMode,
    joinPhaseConfig,
    joinSelectedPhasePresetId,
    joinSelectedLoras,
    joinPriority,
    joinUseInputVideoResolution,
    joinUseInputVideoFps,
    joinNoisedInputVideo,
    joinLoopFirstClip,
  });

  // Expose generateVideo function and state to parent via mutable ref
  useEffect(() => {
    if (parentGenerateVideoRef) {
      parentGenerateVideoRef.current = handleGenerateBatch;
    }
  }, [parentGenerateVideoRef, handleGenerateBatch]);
  
  // Expose name click handler to parent for floating header
  useEffect(() => {
    if (parentNameClickRef) {
      parentNameClickRef.current = handleNameClick;
    }
  }, [parentNameClickRef, handleNameClick]);

  // 🎯 PERF FIX: Uses ref to prevent callback recreation
  const handleSelectionChangeLocal = useCallback((hasSelection: boolean) => {
    // Track selection state - forward to parent for floating CTA control
    parentOnSelectionChangeRef.current?.(hasSelection);
  }, []);

  // Calculate current settings for MotionControl - now using context values
  const currentMotionSettings = useMemo(() => {
    const settings = {
        textBeforePrompts: promptSettings.textBeforePrompts,
        textAfterPrompts: promptSettings.textAfterPrompts,
        basePrompt: promptSettings.prompt,
        negativePrompt: promptSettings.negativePrompt,
        enhancePrompt: promptSettings.enhancePrompt,
        durationFrames: frameSettings.batchVideoFrames,
        lastGeneratedVideoUrl: lastVideoGeneration || undefined,
        selectedLoras: loraManager.selectedLoras.map(lora => ({
            id: lora.id,
            name: lora.name,
            strength: lora.strength
        }))
    };
    return settings;
  }, [promptSettings.textBeforePrompts, promptSettings.textAfterPrompts, promptSettings.prompt, promptSettings.negativePrompt, promptSettings.enhancePrompt, frameSettings.batchVideoFrames, lastVideoGeneration, loraManager.selectedLoras]);

  // ============================================================================
  // CONTEXT VALUE - Built via extracted hook (memoized)
  // ============================================================================
  // Must be called before early return (Rules of Hooks)
  // If selectedShot is undefined, we return early and this value is never used
  const contextValue = useShotSettingsValue({
    // Core
    selectedShot: selectedShot!,
    selectedShotId,
    projectId,
    selectedProjectId,
    effectiveAspectRatio,
    projects,
    // UI state
    state,
    actions,
    // LoRA
    loraManager,
    availableLoras: loraSettingsFromContext.availableLoras,
    // Images
    allShotImages,
    timelineImages,
    contextImages,
    videoOutputs,
    simpleFilteredImages,
    // Structure video
    structureVideo: {
      structureVideoConfig,
      setStructureVideoConfig,
      structureVideoPath,
      structureVideoMetadata,
      structureVideoTreatment,
      structureVideoMotionStrength,
      structureVideoType,
      handleStructureVideoChange,
      isLoading: isStructureVideoSettingsLoading,
      structureVideos,
      addStructureVideo,
      updateStructureVideo,
      removeStructureVideo,
      setStructureVideos,
    },
    handleStructureVideoChangeWithModeSwitch,
    structureVideoHandlers: {
      handleStructureVideoMotionStrengthChange,
      handleStructureTypeChangeFromMotionControl,
      handleUni3cEndPercentChange,
    },
    // Audio
    audio: {
      audioUrl,
      audioMetadata,
      handleAudioChange,
      isLoading: isAudioSettingsLoading,
    },
    // Image handlers
    generationActions,
    handleImageReorder: handleReorderImagesInShot,
    handleImageUpload,
    // Shot management
    shots,
    shotActions,
    // Generation mode state
    generationMode: {
      generateMode,
      setGenerateMode,
      toggleGenerateModePreserveScroll,
      isGenerationDisabled,
      isSteerableMotionEnqueuing,
      steerableMotionJustQueued,
      currentMotionSettings,
      accelerated,
      onAcceleratedChange: handleAcceleratedChange,
      randomSeed,
      onRandomSeedChange: handleRandomSeedChange,
    },
    // Generation handlers
    generationHandlers: {
      handleGenerateBatch,
      handleBatchVideoPromptChangeWithClear,
      handleStepsChange,
      clearAllEnhancedPrompts,
    },
    // Join state
    joinState: {
      joinSettings,
      joinLoraManager,
      joinValidationData,
      handleJoinSegments,
      isJoiningClips,
      joinClipsSuccess,
      handleRestoreJoinDefaults,
    },
    // Dimension settings
    dimensions: {
      dimensionSource,
      onDimensionSourceChange,
      customWidth,
      onCustomWidthChange,
      customHeight,
      onCustomHeightChange,
    },
    // Query client
    queryClient,
  });

  // Early return if no shot selected
  if (!selectedShot) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Shot not found</p>
      </div>
    );
  }

  return (
    <ShotSettingsProvider value={contextValue}>
    <div className="flex flex-col space-y-4 pb-4">
      {/* Header Section */}
      <HeaderSection
        onBack={onBack}
        onPreviousShot={onPreviousShot}
        onNextShot={onNextShot}
        hasPrevious={hasPrevious}
        hasNext={hasNext}
        onUpdateShotName={onUpdateShotName}
        onNameClick={handleNameClick}
        onNameSave={handleNameSave}
        onNameCancel={handleNameCancel}
        onNameKeyDown={handleNameKeyDown}
        headerContainerRef={parentHeaderRef}
        centerSectionRef={centerSectionRef}
        isSticky={isSticky}
      />

      {/* Final Video Section - Shows selected output with dropdown to switch between generations */}
      <div ref={videoGalleryRef} className="flex flex-col gap-4">
        <FinalVideoSection
          shotId={selectedShotId}
          projectId={projectId}
          projectAspectRatio={effectiveAspectRatio}
          onApplySettingsFromTask={applySettingsFromTask}
          onJoinSegmentsClick={() => {
            setGenerateMode('join');

            // Scroll to the generate card - use double RAF to ensure DOM is fully updated after mode switch
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                const target = generateVideosCardRef.current;
                if (target) {
                  const rect = target.getBoundingClientRect();
                  const scrollTop = window.scrollY + rect.top - 20; // 20px padding above
                  window.scrollTo({ top: scrollTop, behavior: 'smooth' });
                }
              });
            });
          }}
          selectedParentId={selectedOutputId}
          onSelectedParentChange={setSelectedOutputId}
          // PERF: Use fast initialParentGenerations for instant thumbnail, then full data when loaded
          parentGenerations={parentGenerations.length > 0 ? parentGenerations : initialParentGenerations}
          segmentProgress={segmentProgress}
          isParentLoading={isSegmentOutputsLoading && initialParentGenerations.length === 0}
          getFinalVideoCount={getFinalVideoCount}
          onDelete={handleDeleteFinalVideo}
          isDeleting={isClearingFinalVideo}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col gap-4">
        
        {/* Image Manager / Timeline - Now uses TimelineSection which pulls most data from context */}
        <TimelineSection
          timelineSectionRef={parentTimelineRef}
          isModeReady={state.isModeReady}
          settingsError={state.settingsError}
          isMobile={isPhone}
          generationMode={generationModeSettings.generationMode}
          onGenerationModeChange={generationModeSettings.setGenerationMode}
          batchVideoFrames={frameSettings.batchVideoFrames}
          onBatchVideoFramesChange={frameSettings.setFrames}
          columns={aspectAdjustedColumns as 2 | 3 | 4 | 6}
          pendingPositions={state.pendingFramePositions}
          onPendingPositionApplied={handlePendingPositionApplied}
          onSelectionChange={handleSelectionChangeLocal}
          defaultPrompt={promptSettings.prompt}
          onDefaultPromptChange={promptSettings.setPrompt}
          defaultNegativePrompt={promptSettings.negativePrompt}
          onDefaultNegativePromptChange={promptSettings.setNegativePrompt}
          maxFrameLimit={81}
          smoothContinuations={motionSettings.smoothContinuations}
          selectedOutputId={selectedOutputId}
          onSelectedOutputChange={setSelectedOutputId}
          onDragStateChange={handleDragStateChange}
        />

        {/* Generation Settings - Now pulls most data from context */}
        <GenerationSection
          // Refs for DOM positioning
          generateVideosCardRef={generateVideosCardRef}
          ctaContainerRef={parentCtaRef}
          swapButtonRef={swapButtonRef}
          joinSegmentsSectionRef={joinSegmentsSectionRef}
          // Parent CTA state
          parentVariantName={parentVariantName}
          parentOnVariantNameChange={parentOnVariantNameChange}
          parentIsGeneratingVideo={parentIsGeneratingVideo}
          parentVideoJustQueued={parentVideoJustQueued}
        />
      </div>
      
      {/* STICKY HEADER NOW RENDERED BY PARENT (VideoTravelToolPage) */}

      {/* Modals Section */}
      <ModalsSection
        isLoraModalOpen={loraManager.isLoraModalOpen}
        onLoraModalClose={() => loraManager.setIsLoraModalOpen(false)}
        onAddLora={loraManager.handleAddLora}
        onRemoveLora={loraManager.handleRemoveLora}
        onUpdateLoraStrength={loraManager.handleLoraStrengthChange}
        selectedLoras={loraManager.selectedLoras}
        isSettingsModalOpen={state.isSettingsModalOpen}
        onSettingsModalOpenChange={actions.setSettingsModalOpen}
      />
    </div>
    </ShotSettingsProvider>
  );
};

// Export with new name and backwards-compat alias
export { ShotSettingsEditor };
export default ShotSettingsEditor;

// Backwards compatibility alias - will be removed after all imports are updated
export const ShotEditor = ShotSettingsEditor; 