import {
  useRef,
  useState,
  useEffect,
  useMemo
} from 'react';
import { GenerationRow } from '@/types/shots';
import { isVideoAny } from '@/shared/lib/typeGuards';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePublicLoras } from '@/shared/hooks/useResources';

import {
  useUpscale,
  useInpainting,
  useEditModeLoRAs,
  useSourceGeneration,
  useMagicEditMode,
  useGenerationLineage,
  useStarToggle,
  useRepositionMode,
  useImg2ImgMode,
  useEditSettingsPersistence,
} from '@/shared/components/MediaLightbox/hooks';

import {
  MediaDisplayWithCanvas,
  TopRightControls,
  BottomLeftControls,
  BottomRightControls,
  EditModePanel,
  FloatingToolControls,
} from '@/shared/components/MediaLightbox/components';
import type { ImageEditState } from '@/shared/components/MediaLightbox/contexts/ImageEditContext';
import type { EditFormState } from '@/shared/components/MediaLightbox/contexts/EditFormContext';
import { Button } from '@/shared/components/ui/button';
import { Square, Trash2, Diamond } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { downloadMedia } from '@/shared/components/MediaLightbox/utils';
import { useVariants } from '@/shared/hooks/useVariants';

interface InlineEditViewProps {
  media: GenerationRow;
  onClose: () => void;
  onNavigateToGeneration?: (generationId: string) => Promise<void>;
}

export function InlineEditView({ media, onClose, onNavigateToGeneration }: InlineEditViewProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  const isMobile = useIsMobile();
  const { selectedProjectId } = useProject();
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudMode = generationMethods.inCloud;

  if (!media) return null;

  // Uses canonical isVideoAny from typeGuards
  const isVideo = isVideoAny(media);
  
  const upscaleHook = useUpscale({ media, selectedProjectId, isVideo });
  const { 
    effectiveImageUrl,
    sourceUrlForTasks,
    isUpscaling,
    showingUpscaled,
    isPendingUpscale,
    hasUpscaledVersion,
    handleUpscale,
    handleToggleUpscaled,
  } = upscaleHook;

  // Image dimensions state (needed by inpainting hook)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Create as variant toggle - when true, creates variant; when false, creates new generation
  // Default to false (createAsGeneration=false means variant mode is ON)
  const [createAsGeneration, setCreateAsGeneration] = useState(false);
  
  // Flip functionality removed - use reposition mode instead
  const isFlippedHorizontally = false;
  const isSaving = false;

  const { isInSceneBoostEnabled, setIsInSceneBoostEnabled, loraMode, setLoraMode, customLoraUrl, setCustomLoraUrl, editModeLoRAs } = useEditModeLoRAs();

  // Variants hook - moved early so activeVariantId is available for other hooks
  // Detect if this is a shot_generation record (has shotImageEntryId or shot_generation_id matching media.id)
  const isShotGenerationRecord = media.shotImageEntryId === media.id ||
                                  media.shot_generation_id === media.id;
  const actualGenerationId = media.generation_id ||
                              (!isShotGenerationRecord ? media.id : null);

  // Edit settings persistence - for img2img strength, enablePromptExpansion, and editMode
  const editSettingsPersistence = useEditSettingsPersistence({
    generationId: actualGenerationId,
    projectId: selectedProjectId,
  });
  const {
    editMode: persistedEditMode,
    setEditMode: setPersistedEditMode,
    img2imgStrength: persistedImg2imgStrength,
    img2imgEnablePromptExpansion: persistedImg2imgEnablePromptExpansion,
    img2imgPrompt: persistedImg2imgPrompt,
    img2imgPromptHasBeenSet: persistedImg2imgPromptHasBeenSet,
    setImg2imgStrength: setPersistedImg2imgStrength,
    setImg2imgEnablePromptExpansion: setPersistedImg2imgEnablePromptExpansion,
    setImg2imgPrompt: setPersistedImg2imgPrompt,
    prompt: persistedPrompt,
    setPrompt: setPersistedPrompt,
    numGenerations,
    setNumGenerations,
    isReady: isEditSettingsReady,
    hasPersistedSettings,
  } = editSettingsPersistence;
  const {
    activeVariant,
    setActiveVariantId,
    refetch: refetchVariants,
  } = useVariants({
    generationId: actualGenerationId,
    enabled: true,
  });

  const inpaintingHook = useInpainting({
    media,
    selectedProjectId,
    isVideo,
    displayCanvasRef,
    maskCanvasRef,
    imageContainerRef,
    imageDimensions,
    handleExitInpaintMode: () => {},
    loras: editModeLoRAs,
    toolTypeOverride: 'edit-images',
    activeVariantId: activeVariant?.id, // Store strokes per-variant, not per-generation
    createAsGeneration, // If true, create a new generation instead of a variant
  });
  const {
    isInpaintMode,
    brushStrokes,
    isEraseMode,
    inpaintPrompt,
    inpaintNumGenerations,
    brushSize,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isAnnotateMode,
    editMode,
    annotationMode,
    selectedShapeId,
    showTextModeHint,
    isDrawing,
    currentStroke,
    setIsInpaintMode,
    setIsEraseMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsAnnotateMode,
    setEditMode,
    setAnnotationMode,
    handleKonvaPointerDown,
    handleKonvaPointerMove,
    handleKonvaPointerUp,
    handleShapeClick,
    handleUndo,
    handleClearMask,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    handleToggleFreeForm,
    getDeleteButtonPosition,
    strokeOverlayRef,
  } = inpaintingHook;
  
  const magicEditHook = useMagicEditMode({
    media,
    selectedProjectId,
    isVideo,
    isInpaintMode,
    setIsInpaintMode,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    brushStrokes,
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    editModeLoRAs,
    sourceUrlForTasks,
    imageDimensions,
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,
    toolTypeOverride: 'edit-images',
    createAsGeneration, // If true, create a new generation instead of a variant
    // qwenEditModel not passed - uses default 'qwen-edit'
  });
  const {
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    inpaintPanelPosition,
    setInpaintPanelPosition,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    isSpecialEditMode
  } = magicEditHook;

  const repositionHook = useRepositionMode({
    media,
    selectedProjectId,
    imageDimensions,
    imageContainerRef,
    loras: editModeLoRAs,
    inpaintPrompt,
    inpaintNumGenerations,
    handleExitInpaintMode: handleExitMagicEditMode,
    toolTypeOverride: 'edit-images',
    onVariantCreated: setActiveVariantId,
    refetchVariants,
    createAsGeneration, // If true, create a new generation instead of a variant
  });
  const {
    transform: repositionTransform,
    hasTransformChanges,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    handleGenerateReposition,
    handleSaveAsVariant,
    getTransformStyle,
  } = repositionHook;

  // Fetch available LoRAs for img2img mode
  const { data: availableLoras } = usePublicLoras();

  // Img2Img mode hook - uses persisted settings
  
  const img2imgHook = useImg2ImgMode({
    media,
    selectedProjectId,
    isVideo,
    sourceUrlForTasks,
    toolTypeOverride: 'edit-images',
    createAsGeneration,
    availableLoras,
    // Pass persisted values
    img2imgStrength: persistedImg2imgStrength,
    setImg2imgStrength: setPersistedImg2imgStrength,
    enablePromptExpansion: persistedImg2imgEnablePromptExpansion,
    setEnablePromptExpansion: setPersistedImg2imgEnablePromptExpansion,
    // Img2Img prompt is persisted separately to avoid cross-mode races
    img2imgPrompt: persistedImg2imgPrompt,
    setImg2imgPrompt: setPersistedImg2imgPrompt,
    img2imgPromptHasBeenSet: persistedImg2imgPromptHasBeenSet,
    // Number of generations (shared with other edit modes)
    numGenerations,
  });
  const {
    img2imgPrompt,
    img2imgStrength,
    enablePromptExpansion,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    setImg2imgPrompt,
    setImg2imgStrength,
    setEnablePromptExpansion,
    handleGenerateImg2Img,
    loraManager: img2imgLoraManager,
  } = img2imgHook;

  // Track if we've synced from persistence
  const hasInitializedFromPersistenceRef = useRef(false);
  // Track the last known good prompt to prevent race conditions
  const lastUserPromptRef = useRef<string>('');
  // Debounce timer for prompt sync
  const promptSyncTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync persistence → useInpainting (on initial load)
  useEffect(() => {
    if (!isEditSettingsReady || hasInitializedFromPersistenceRef.current) return;
    
    // Sync editMode
    if (persistedEditMode && persistedEditMode !== editMode) {
      setEditMode(persistedEditMode);
    }
    
    // Sync numGenerations
    if (numGenerations !== inpaintNumGenerations) {
      setInpaintNumGenerations(numGenerations);
    }
    
    // Sync prompt (only if has persisted settings - otherwise leave empty to avoid resetting user input)
    if (hasPersistedSettings && persistedPrompt && persistedPrompt !== inpaintPrompt) {
      setInpaintPrompt(persistedPrompt);
      lastUserPromptRef.current = persistedPrompt;
    }
    
    hasInitializedFromPersistenceRef.current = true;
  }, [isEditSettingsReady, hasPersistedSettings, persistedEditMode, editMode, setEditMode, numGenerations, inpaintNumGenerations, setInpaintNumGenerations, persistedPrompt, inpaintPrompt, setInpaintPrompt]);

  // Sync editMode: useInpainting → persistence (on change)
  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;
    
    if (editMode !== persistedEditMode) {
      setPersistedEditMode(editMode);
    }
  }, [editMode, persistedEditMode, setPersistedEditMode, isEditSettingsReady]);

  // Sync numGenerations: useInpainting → persistence (on change)
  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;
    
    if (inpaintNumGenerations !== numGenerations) {
      setNumGenerations(inpaintNumGenerations);
    }
  }, [inpaintNumGenerations, numGenerations, setNumGenerations, isEditSettingsReady]);

  // Sync prompt: useInpainting → persistence (on change, with debounce to prevent race conditions)
  useEffect(() => {
    if (!hasInitializedFromPersistenceRef.current || !isEditSettingsReady) return;
    
    // If inpaintPrompt is reset to empty but we had a user prompt, it's likely a race condition - ignore
    if (inpaintPrompt === '' && lastUserPromptRef.current !== '' && persistedPrompt !== '') {
      // Restore the prompt from persistence after a short delay
      if (promptSyncTimerRef.current) clearTimeout(promptSyncTimerRef.current);
      promptSyncTimerRef.current = setTimeout(() => {
        if (persistedPrompt) {
          setInpaintPrompt(persistedPrompt);
        }
      }, 100);
      return;
    }
    
    if (inpaintPrompt !== persistedPrompt) {
      setPersistedPrompt(inpaintPrompt);
      lastUserPromptRef.current = inpaintPrompt;
    }
  }, [inpaintPrompt, persistedPrompt, setPersistedPrompt, setInpaintPrompt, isEditSettingsReady]);
  
  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (promptSyncTimerRef.current) clearTimeout(promptSyncTimerRef.current);
    };
  }, []);

  const { sourceGenerationData } = useSourceGeneration({
    media,
    onOpenExternalGeneration: onNavigateToGeneration ? 
      async (id) => onNavigateToGeneration(id) : undefined
  });

  const lineageHook = useGenerationLineage({ media });
  const {
    derivedGenerations,
    derivedPage,
    derivedTotalPages,
    paginatedDerived,
    setDerivedPage,
  } = lineageHook;
  
  const starToggleHook = useStarToggle({ media });
  const { localStarred, toggleStarMutation, handleToggleStar } = starToggleHook;

  const handleDownload = async () => {
    await downloadMedia(effectiveImageUrl, media.id, isVideo, media.contentType);
  };

  useEffect(() => {
    if (!isSpecialEditMode) {
       handleEnterMagicEditMode();
    }
  }, [isSpecialEditMode, handleEnterMagicEditMode]);

  // ========================================
  // STATE VALUES FOR EDIT MODE PANEL
  // These are passed as props to EditModePanel (props-first pattern)
  // ========================================

  // Build ImageEditState value
  const imageEditValue = useMemo<ImageEditState>(() => ({
    // Mode state
    isInpaintMode,
    isMagicEditMode: isSpecialEditMode,
    isSpecialEditMode,
    editMode: editMode as ImageEditState['editMode'],

    // Mode setters
    setIsInpaintMode,
    setIsMagicEditMode: () => {},
    setEditMode: setEditMode as ImageEditState['setEditMode'],

    // Mode entry/exit handlers
    handleEnterInpaintMode,
    handleExitInpaintMode: handleExitMagicEditMode,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,

    // Brush/Inpaint state
    brushSize,
    setBrushSize,
    isEraseMode,
    setIsEraseMode,
    brushStrokes,
    currentStroke,
    isDrawing,

    // Annotation state
    isAnnotateMode,
    setIsAnnotateMode,
    annotationMode,
    setAnnotationMode,
    selectedShapeId,

    // Undo/Clear
    handleUndo,
    handleClearMask,

    // Reposition state
    repositionTransform: repositionHook.transform,
    hasTransformChanges,

    // Panel UI state
    inpaintPanelPosition,
    setInpaintPanelPosition,
  }), [
    isInpaintMode,
    isSpecialEditMode,
    editMode,
    setIsInpaintMode,
    setEditMode,
    handleEnterInpaintMode,
    handleExitMagicEditMode,
    handleEnterMagicEditMode,
    brushSize,
    setBrushSize,
    isEraseMode,
    setIsEraseMode,
    brushStrokes,
    currentStroke,
    isDrawing,
    isAnnotateMode,
    setIsAnnotateMode,
    annotationMode,
    setAnnotationMode,
    selectedShapeId,
    handleUndo,
    handleClearMask,
    repositionHook.transform,
    hasTransformChanges,
    inpaintPanelPosition,
    setInpaintPanelPosition,
  ]);

  // Build EditFormContext value
  const editFormValue = useMemo<EditFormState>(() => ({
    // Inpaint form
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,

    // Img2Img form
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,

    // LoRA mode
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,

    // Generation options
    createAsGeneration,
    setCreateAsGeneration,

    // Model selection
    qwenEditModel: 'qwen-edit-2511',
    setQwenEditModel: () => {},

    // Advanced settings (not used in InlineEditView)
    advancedSettings: {
      enableHiresFix: false,
      hiresFixScale: 1.5,
      hiresFixDenoisingStrength: 0.4,
      numSteps: 20,
    },
    setAdvancedSettings: () => {},

    // Generation status
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
  }), [
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    createAsGeneration,
    setCreateAsGeneration,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
  ]);

  if (isMobile) {
    return (
      <TooltipProvider delayDuration={500}>
        <div className="w-full flex flex-col bg-transparent">
          <div 
              className="flex items-center justify-center relative bg-black w-full shrink-0 rounded-t-2xl overflow-hidden"
              style={{ height: '45dvh', touchAction: 'pan-y' }}
            >
               <MediaDisplayWithCanvas
                 effectiveImageUrl={effectiveImageUrl}
                 thumbUrl={media.thumbnail_url || media.thumbUrl}
                 isVideo={isVideo}
                 isFlippedHorizontally={isFlippedHorizontally}
                 isSaving={isSaving}
                 isInpaintMode={isInpaintMode}
                 editMode={editMode}
                 repositionTransformStyle={editMode === 'reposition' ? getTransformStyle() : undefined}
                 imageContainerRef={imageContainerRef}
                 canvasRef={canvasRef}
                 maskCanvasRef={maskCanvasRef}
                 onImageLoad={setImageDimensions}
                 variant="mobile-stacked"
                 containerClassName="w-full h-full"
                 debugContext="Mobile Inline"
                 // Konva stroke overlay props
                 imageDimensions={imageDimensions}
                 brushStrokes={brushStrokes}
                 currentStroke={currentStroke}
                 isDrawing={isDrawing}
                 isEraseMode={isEraseMode}
                 brushSize={brushSize}
                 annotationMode={editMode === 'annotate' ? annotationMode : null}
                 selectedShapeId={selectedShapeId}
                 onStrokePointerDown={handleKonvaPointerDown}
                 onStrokePointerMove={handleKonvaPointerMove}
                 onStrokePointerUp={handleKonvaPointerUp}
                 onShapeClick={handleShapeClick}
                 strokeOverlayRef={strokeOverlayRef}
               />
             
               {isSpecialEditMode && (
                   <FloatingToolControls
                     variant="mobile"
                     editMode={editMode}
                     onSetEditMode={setEditMode}
                     brushSize={brushSize}
                     isEraseMode={isEraseMode}
                     onSetBrushSize={setBrushSize}
                     onSetIsEraseMode={setIsEraseMode}
                     annotationMode={annotationMode}
                     onSetAnnotationMode={setAnnotationMode}
                     repositionTransform={repositionTransform}
                     onRepositionScaleChange={setScale}
                     onRepositionRotationChange={setRotation}
                     onRepositionFlipH={toggleFlipH}
                     onRepositionFlipV={toggleFlipV}
                     onRepositionReset={resetTransform}
                     brushStrokes={brushStrokes}
                     onUndo={handleUndo}
                     onClearMask={handleClearMask}
                     panelPosition={inpaintPanelPosition}
                     onSetPanelPosition={setInpaintPanelPosition}
                   />
                 )}

                 <TopRightControls
                   isVideo={isVideo}
                   readOnly={false}
                   isSpecialEditMode={isSpecialEditMode}
                   selectedProjectId={selectedProjectId}
                   isCloudMode={isCloudMode}
                   showDownload={true}
                   handleDownload={handleDownload}
                   mediaId={media.id}
                   onClose={onClose}
                 />

                 <BottomLeftControls
                   isVideo={isVideo}
                   readOnly={false}
                   isSpecialEditMode={isSpecialEditMode}
                   selectedProjectId={selectedProjectId}
                   isCloudMode={isCloudMode}
                   handleEnterMagicEditMode={handleEnterMagicEditMode}
                   isUpscaling={isUpscaling}
                   isPendingUpscale={isPendingUpscale}
                   hasUpscaledVersion={hasUpscaledVersion}
                   showingUpscaled={showingUpscaled}
                   handleUpscale={handleUpscale}
                   handleToggleUpscaled={handleToggleUpscaled}
                 />

                 <BottomRightControls
                   isVideo={isVideo}
                   readOnly={false}
                   isSpecialEditMode={isSpecialEditMode}
                   selectedProjectId={selectedProjectId}
                   isCloudMode={isCloudMode}
                   localStarred={localStarred}
                   handleToggleStar={handleToggleStar}
                   toggleStarPending={toggleStarMutation.isPending}
                   isAddingToReferences={false}
                   addToReferencesSuccess={false}
                   handleAddToReferences={() => {}}
                 />
             </div>

            <div 
              className={cn(
                "bg-background border-t border-border relative z-[60] w-full rounded-b-2xl pb-8"
              )}
              style={{ minHeight: '55dvh' }}
            >
              {isSpecialEditMode ? (
                <EditModePanel
                  variant="mobile"
                  hideInfoEditToggle={true}
                  simplifiedHeader={true}
                  sourceGenerationData={sourceGenerationData}
                  onOpenExternalGeneration={onNavigateToGeneration ?
                    async (id) => onNavigateToGeneration(id) : undefined
                  }
                  currentMediaId={media.id}
                  handleUnifiedGenerate={handleUnifiedGenerate}
                  handleGenerateAnnotatedEdit={handleGenerateAnnotatedEdit}
                  handleGenerateReposition={handleGenerateReposition}
                  handleSaveAsVariant={handleSaveAsVariant}
                  handleGenerateImg2Img={handleGenerateImg2Img}
                  img2imgLoraManager={img2imgLoraManager}
                  availableLoras={availableLoras}
                  coreState={{ onClose }}
                  imageEditState={imageEditValue}
                  editFormState={editFormValue}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <h3 className="text-xl font-medium">Image Editor</h3>
                  <p className="text-muted-foreground">Select an option to start editing</p>

                  <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
                    <Button onClick={() => {
                      setIsInpaintMode(true);
                      setEditMode('inpaint');
                    }} className="w-full">
                      Inpaint / Erase
                    </Button>

                    <Button onClick={handleEnterMagicEditMode} variant="secondary" className="w-full">
                      Magic Edit
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </TooltipProvider>
    );
  }

  return (
    <TooltipProvider delayDuration={500}>
      <div className="w-full h-full flex bg-transparent overflow-hidden">
        <div 
            className="flex-1 flex items-center justify-center relative bg-black rounded-l-xl overflow-hidden"
            style={{ width: '60%', height: '100%' }}
          >
            <MediaDisplayWithCanvas
              effectiveImageUrl={effectiveImageUrl}
              thumbUrl={media.thumbnail_url || media.thumbUrl}
              isVideo={isVideo}
              isFlippedHorizontally={isFlippedHorizontally}
              isSaving={isSaving}
              isInpaintMode={isInpaintMode}
              editMode={editMode}
              repositionTransformStyle={editMode === 'reposition' ? getTransformStyle() : undefined}
              imageContainerRef={imageContainerRef}
              canvasRef={canvasRef}
              maskCanvasRef={maskCanvasRef}
              onImageLoad={setImageDimensions}
              variant="desktop-side-panel"
              containerClassName="max-w-full max-h-full"
              debugContext="InlineEdit"
              // Konva stroke overlay props
              imageDimensions={imageDimensions}
              brushStrokes={brushStrokes}
              currentStroke={currentStroke}
              isDrawing={isDrawing}
              isEraseMode={isEraseMode}
              brushSize={brushSize}
              annotationMode={editMode === 'annotate' ? annotationMode : null}
              selectedShapeId={selectedShapeId}
              onStrokePointerDown={handleKonvaPointerDown}
              onStrokePointerMove={handleKonvaPointerMove}
              onStrokePointerUp={handleKonvaPointerUp}
              onShapeClick={handleShapeClick}
              strokeOverlayRef={strokeOverlayRef}
            />

            {selectedShapeId && isAnnotateMode && (() => {
              const buttonPos = getDeleteButtonPosition();
              if (!buttonPos) return null;
              
              const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
              const isFreeForm = selectedShape?.isFreeForm || false;
              
              return (
                <div className="absolute z-[100] flex gap-2" style={{
                  left: `${buttonPos.x}px`,
                  top: `${buttonPos.y}px`,
                  transform: 'translate(-50%, -50%)'
                }}>
                  <button
                    onClick={handleToggleFreeForm}
                    className={cn(
                      "rounded-full p-2 shadow-lg transition-colors",
                      isFreeForm 
                        ? "bg-purple-600 hover:bg-purple-700 text-white" 
                        : "bg-gray-700 hover:bg-gray-600 text-white"
                    )}
                    title={isFreeForm 
                      ? "Switch to rectangle mode (edges move linearly)" 
                      : "Switch to free-form mode (rhombus/non-orthogonal angles)"}
                  >
                    {isFreeForm ? <Diamond className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                  </button>
                  
                  <button
                    onClick={handleDeleteSelected}
                    className="bg-red-600 hover:bg-red-700 text-white rounded-full p-2 shadow-lg transition-colors"
                    title="Delete annotation (or press DELETE key)"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })()}

              {isSpecialEditMode && (
                <FloatingToolControls
                  variant={isMobile ? "mobile" : "tablet"}
                  editMode={editMode}
                  onSetEditMode={setEditMode}
                  brushSize={brushSize}
                  isEraseMode={isEraseMode}
                  onSetBrushSize={setBrushSize}
                  onSetIsEraseMode={setIsEraseMode}
                  annotationMode={annotationMode}
                  onSetAnnotationMode={setAnnotationMode}
                  repositionTransform={repositionTransform}
                  onRepositionScaleChange={setScale}
                  onRepositionRotationChange={setRotation}
                  onRepositionFlipH={toggleFlipH}
                  onRepositionFlipV={toggleFlipV}
                  onRepositionReset={resetTransform}
                  brushStrokes={brushStrokes}
                  onUndo={handleUndo}
                  onClearMask={handleClearMask}
                  panelPosition={inpaintPanelPosition}
                  onSetPanelPosition={setInpaintPanelPosition}
                />
              )}

              <BottomLeftControls
                isVideo={isVideo}
                readOnly={false}
                isSpecialEditMode={isSpecialEditMode}
                selectedProjectId={selectedProjectId}
                isCloudMode={isCloudMode}
                handleEnterMagicEditMode={handleEnterMagicEditMode}
                isUpscaling={isUpscaling}
                isPendingUpscale={isPendingUpscale}
                hasUpscaledVersion={hasUpscaledVersion}
                showingUpscaled={showingUpscaled}
                handleUpscale={handleUpscale}
                handleToggleUpscaled={handleToggleUpscaled}
              />

              <BottomRightControls
                isVideo={isVideo}
                readOnly={false}
                isSpecialEditMode={isSpecialEditMode}
                selectedProjectId={selectedProjectId}
                isCloudMode={isCloudMode}
                localStarred={localStarred}
                handleToggleStar={handleToggleStar}
                toggleStarPending={toggleStarMutation.isPending}
                isAddingToReferences={false}
                addToReferencesSuccess={false}
                handleAddToReferences={() => {}}
              />

              <TopRightControls
                isVideo={isVideo}
                readOnly={false}
                isSpecialEditMode={isSpecialEditMode}
                selectedProjectId={selectedProjectId}
                isCloudMode={isCloudMode}
                showDownload={true}
                handleDownload={handleDownload}
                mediaId={media.id}
                onClose={onClose}
              />
          </div>

          <div 
            className={cn(
              "bg-background border-l border-border overflow-y-auto relative z-[60] rounded-r-xl"
            )}
            style={{ width: '40%', height: '100%' }}
          >
            {isSpecialEditMode ? (
              <EditModePanel
                variant="desktop"
                hideInfoEditToggle={true}
                simplifiedHeader={true}
                sourceGenerationData={sourceGenerationData}
                onOpenExternalGeneration={onNavigateToGeneration ?
                  async (id) => onNavigateToGeneration(id) : undefined
                }
                currentMediaId={media.id}
                handleUnifiedGenerate={handleUnifiedGenerate}
                handleGenerateAnnotatedEdit={handleGenerateAnnotatedEdit}
                handleGenerateReposition={handleGenerateReposition}
                handleSaveAsVariant={handleSaveAsVariant}
                handleGenerateImg2Img={handleGenerateImg2Img}
                img2imgLoraManager={img2imgLoraManager}
                availableLoras={availableLoras}
                coreState={{ onClose }}
                imageEditState={imageEditValue}
                editFormState={editFormValue}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-4">
                <h3 className="text-xl font-medium">Image Editor</h3>
                <p className="text-muted-foreground">Select an option to start editing</p>

                <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
                  <Button onClick={() => {
                    setIsInpaintMode(true);
                    setEditMode('inpaint');
                  }} className="w-full">
                    Inpaint / Erase
                  </Button>

                  <Button onClick={handleEnterMagicEditMode} variant="secondary" className="w-full">
                    Magic Edit
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </TooltipProvider>
  );
}

