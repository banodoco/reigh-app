import React, { Suspense } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Textarea } from '@/shared/components/ui/textarea';
import { Switch } from '@/shared/components/ui/switch';
import { Label } from '@/shared/components/ui/primitives/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { XCircle, Layers, Plus } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { ActiveLoRAsDisplay } from '@/shared/components/lora/ActiveLoRAsDisplay';
import { mapSelectedLorasForModal } from '@/shared/components/lora/mapSelectedLorasForModal';
import { LoraSelectorModal } from '@/domains/lora/components/LoraSelectorModal';
import { EditAdvancedSettings } from './EditAdvancedSettings';
import { EditPanelLayout } from './EditPanelLayout';
import { ImageUpscaleForm } from './ImageUpscaleForm';
import { ModeSelector } from './ModeSelector';
import { RepositionButtons } from './editModes/RepositionButtons';
import { Img2ImgControls } from './editModes/Img2ImgControls';
import { GenerateButton } from './editModes/GenerateButton';
import type { EditModePanelProps } from './types';
import { useEditModePanelState } from '../hooks/useEditModePanelState';

/**
 * EditModePanel Component
 *
 * The panel shown when in edit mode (inpaint/magic-edit/annotate/reposition/img2img).
 * Uses shared EditPanelLayout for consistent header and variants handling.
 *
 * Supports props-first pattern: optional state props (coreState, imageEditState,
 * variantsState) override context values when provided. This allows
 * the component to work both within ImageLightbox (using context) and standalone
 * (using props, e.g., in InlineEditView).
 *
 * Logic (state resolution, side effects, mode config) lives in useEditModePanelState.
 */
// Default prompt for reposition mode - shown when user hasn't entered a custom prompt
const REPOSITION_DEFAULT_PROMPT = 'match existing content';

export const EditModePanel: React.FC<EditModePanelProps> = ({
  variant,
  hideInfoEditToggle = false,
  simplifiedHeader = false,
  taskId,
  currentMediaId,
  actions,
  upscale,
  lora,
  advanced,
  isLocalGeneration = false,
  stateOverrides,
}) => {
  const {
    handleUnifiedGenerate,
    handleGenerateAnnotatedEdit,
    handleGenerateReposition,
    handleSaveAsVariant,
    handleGenerateImg2Img,
  } = actions;
  const {
    isCloudMode,
    handleUpscale,
    isUpscaling,
    upscaleSuccess,
  } = upscale ?? {};
  const {
    img2imgLoraManager,
    editLoraManager,
    availableLoras = [],
  } = lora ?? {};
  const {
    advancedSettings,
    setAdvancedSettings,
  } = advanced ?? {};

  // All state resolution, side effects, mode config, and responsive styles
  const state = useEditModePanelState({
    variant,
    currentMediaId,
    isCloudMode,
    handleUpscale,
    coreState: stateOverrides?.coreState,
    imageEditState: stateOverrides?.imageEditState,
    variantsState: stateOverrides?.variantsState,
  });

  const {
    isMobile,
    onClose,
    editMode,
    handleExitMagicEditMode,
    // Form
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    createAsGeneration,
    setCreateAsGeneration,
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    qwenEditModel,
    setQwenEditModel,
    // Status
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    // Variants
    variants,
    activeVariantId,
    onVariantSelect,
    onMakePrimary,
    isLoadingVariants,
    onPromoteToGeneration,
    isPromoting,
    onDeleteVariant,
    onLoadVariantSettings,
    // Local state
    hasUserEditedPrompt,
    setHasUserEditedPrompt,
    // Handlers
    handleClearLora,
    // Canvas
    brushStrokes,
    hasTransformChanges,
    // Mode selector
    modeSelectorItems,
    // Responsive styles
    labelSize,
    textareaMinHeight,
    textareaRows,
    textareaPadding,
    textareaTextSize,
    generationsSpacing,
  } = state;

  // Section label component for mobile
  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    isMobile ? (
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium mb-1">
        {children}
      </div>
    ) : null
  );

  const modeSelector = (
    <ModeSelector
      items={modeSelectorItems}
      activeId={editMode ?? 'text'}
    />
  );

  return (
    <>
      <EditPanelLayout
        variant={variant}
        onClose={onClose}
        onExitEditMode={handleExitMagicEditMode}
        hideInfoEditToggle={hideInfoEditToggle}
        simplifiedHeader={simplifiedHeader}
        modeSelector={modeSelector}
        taskId={taskId}
        variants={variants}
        activeVariantId={activeVariantId}
        onVariantSelect={onVariantSelect}
        onMakePrimary={onMakePrimary}
        isLoadingVariants={isLoadingVariants}
        onPromoteToGeneration={onPromoteToGeneration}
        isPromoting={isPromoting}
        onDeleteVariant={onDeleteVariant}
        onLoadVariantSettings={onLoadVariantSettings}
      >
          {/* Prompt Field - Hidden for img2img mode (has its own prompt field) and upscale mode */}
          {editMode !== 'img2img' && editMode !== 'upscale' && (() => {
            // For reposition mode, show default prompt only if user hasn't interacted with the field yet
            const isRepositionMode = editMode === 'reposition';
            const isUsingDefaultPrompt = isRepositionMode && !inpaintPrompt && !hasUserEditedPrompt;
            const displayPromptValue = isUsingDefaultPrompt ? REPOSITION_DEFAULT_PROMPT : inpaintPrompt;

            return (
              <div className={generationsSpacing}>
                <SectionLabel>Prompt</SectionLabel>
                <div className="flex items-center gap-2">
                  {!isMobile && <label className={`${labelSize} font-medium`}>Prompt{isRepositionMode ? ' (optional)' : ''}:</label>}
                  {isUsingDefaultPrompt && (
                    <span className="text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </div>
                <Textarea
                  value={displayPromptValue}
                  onChange={(e) => {
                    setHasUserEditedPrompt(true);
                    setInpaintPrompt(e.target.value);
                  }}
                  placeholder={
                    editMode === 'text'
                      ? (isMobile ? "Describe changes..." : "Describe the text-based edit to make...")
                      : editMode === 'annotate'
                        ? (isMobile ? "What to generate..." : "Describe what to generate in the annotated regions...")
                        : editMode === 'reposition'
                          ? "" // No placeholder needed - we show default value instead
                          : (isMobile ? "What to generate..." : "Describe what to generate in the masked area...")
                  }
                  className={`w-full ${textareaMinHeight} ${textareaPadding} ${textareaTextSize} resize-none`}
                  rows={textareaRows}
                  clearable
                  onClear={() => {
                    setHasUserEditedPrompt(true);
                    setInpaintPrompt('');
                  }}
                  voiceInput
                  voiceContext="This is an image editing prompt. Describe what changes to make to the image - what to add, remove, or modify in the selected/masked area. Be specific about the visual result you want."
                  onVoiceResult={(result) => {
                    setHasUserEditedPrompt(true);
                    setInpaintPrompt(result.prompt || result.transcription);
                  }}
                />
              </div>
            );
          })()}

          {/* Img2Img Mode Controls */}
          {editMode === 'img2img' && (
            <Img2ImgControls
              isMobile={isMobile}
              img2imgPrompt={img2imgPrompt}
              setImg2imgPrompt={setImg2imgPrompt}
              img2imgStrength={img2imgStrength}
              setImg2imgStrength={setImg2imgStrength}
              isGeneratingImg2Img={isGeneratingImg2Img}
              img2imgGenerateSuccess={img2imgGenerateSuccess}
              handleGenerateImg2Img={handleGenerateImg2Img!}
              img2imgLoraManager={img2imgLoraManager}
              availableLoras={availableLoras}
              SectionLabel={SectionLabel}
            />
          )}

          {/* Model Selector + LoRA Selector - Shown for non-img2img/upscale edit modes */}
          {editMode !== 'img2img' && editMode !== 'upscale' && editLoraManager && (
            <div className={generationsSpacing}>
              <SectionLabel>Model & LoRAs</SectionLabel>
              <div className={cn("flex items-center gap-2", isMobile ? "mb-1" : "mb-2")}>
                {/* Model Selector (40% width) */}
                {setQwenEditModel && (
                  <Select value={qwenEditModel} onValueChange={(value) => value && setQwenEditModel(value)}>
                    <SelectTrigger variant="retro" className={cn("w-[40%]", isMobile ? "h-7 text-xs" : "h-10")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent variant="retro" className="z-[100001]">
                      <SelectItem variant="retro" value="qwen-edit">Qwen-Edit</SelectItem>
                      <SelectItem variant="retro" value="qwen-edit-2509">Qwen-Edit-2509</SelectItem>
                      <SelectItem variant="retro" value="qwen-edit-2511">Qwen-Edit-2511</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {/* LoRA button (40% width) */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => editLoraManager.setIsLoraModalOpen(true)}
                  className={cn("w-[40%] h-10 px-2 text-xs flex items-center justify-center gap-1", isMobile && "h-6 text-[10px]")}
                >
                  <Plus className={cn(isMobile ? "h-2.5 w-2.5" : "h-3 w-3")} />
                  <span>LoRA</span>
                </Button>
                {/* 20% empty space is implicit from the remaining width */}
              </div>

              {/* Display selected LoRAs */}
              {editLoraManager.selectedLoras.length > 0 && (
                <ActiveLoRAsDisplay
                  selectedLoras={editLoraManager.selectedLoras}
                  onRemoveLora={editLoraManager.handleRemoveLora}
                  onLoraStrengthChange={editLoraManager.handleLoraStrengthChange}
                  isGenerating={isGeneratingInpaint || isCreatingMagicEditTasks}
                  availableLoras={availableLoras}
                  className={isMobile ? "mt-1" : "mt-2"}
                />
              )}
            </div>
          )}

          {/* Upscale Mode - Shows ImageUpscaleForm */}
          {editMode === 'upscale' && handleUpscale && (
            <ImageUpscaleForm
              onUpscale={handleUpscale}
              isUpscaling={isUpscaling ?? false}
              upscaleSuccess={upscaleSuccess ?? false}
              variant={variant}
            />
          )}

          {/* Legacy LoRA Selector - Fallback for when editLoraManager is not provided */}
          {editMode !== 'img2img' && editMode !== 'upscale' && !editLoraManager && (
          <div>
            <SectionLabel>Style LoRA</SectionLabel>
            <div className="flex items-center gap-2">
              {!isMobile && <label className={`text-sm font-medium whitespace-nowrap`}>LoRA:</label>}
              <div className="flex items-center gap-1 flex-1">
                <Select value={loraMode} onValueChange={(value) => value && setLoraMode(value)}>
                  <SelectTrigger variant="retro" className={cn("flex-1", isMobile ? "h-7 text-xs" : "h-10")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent variant="retro" className="z-[100001]">
                    <SelectItem variant="retro" value="none">None</SelectItem>
                    <SelectItem variant="retro" value="in-scene">InScene</SelectItem>
                    <SelectItem variant="retro" value="next-scene">Next Scene</SelectItem>
                    <SelectItem variant="retro" value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {loraMode !== 'none' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearLora}
                    className={cn(
                      "h-9 w-9 p-0 hover:bg-muted shrink-0",
                      isMobile && "h-7 w-7"
                    )}
                    title="Clear LoRA selection"
                  >
                    <XCircle className={cn("h-4 w-4 text-muted-foreground", isMobile && "h-3 w-3")} />
                  </Button>
                )}
              </div>
            </div>

            {/* Custom URL Input - Show when Custom is selected */}
            {loraMode === 'custom' && (
              <input
                type="text"
                value={customLoraUrl}
                onChange={(e) => setCustomLoraUrl(e.target.value)}
                placeholder="Enter a Hugging Face LoRA URL"
                className={cn(
                  "w-full mt-1.5 bg-background border border-input rounded-md preserve-case",
                  "focus:outline-none focus:ring-2 focus:ring-ring",
                  isMobile ? "px-2 py-1.5 text-base" : "px-3 py-2 text-sm"
                )}
              />
            )}
          </div>
          )}

          {/* Advanced Settings - shown for edit modes that support hires fix (not img2img/upscale) */}
          {advancedSettings && setAdvancedSettings && editMode !== 'img2img' && editMode !== 'upscale' && !isMobile && (
            <EditAdvancedSettings
              settings={advancedSettings}
              onSettingsChange={setAdvancedSettings}
              isLocalGeneration={isLocalGeneration}
            />
          )}

          {/* Number of Generations + Create as Variant - shown for all image edit modes except upscale */}
          {setCreateAsGeneration && editMode !== 'upscale' && (
            <div className={cn(
              "py-1.5 px-1 rounded-md flex items-center gap-2 overflow-hidden w-[80%]",
              isMobile && "bg-muted/30"
            )}>
              <SectionLabel>Options</SectionLabel>
              {/* Number of Generations */}
              <div className={cn("flex items-center gap-2 min-w-0", isMobile ? "flex-1" : "flex-shrink")}>
                <label className={cn(
                  "font-medium whitespace-nowrap flex-shrink-0",
                  isMobile ? "text-[10px] text-muted-foreground" : "text-sm"
                )}>
                  {isMobile ? '#' : 'Generations:'}
                </label>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <input
                    type="range"
                    min={1}
                    max={16}
                    value={inpaintNumGenerations}
                    onChange={(e) => setInpaintNumGenerations(parseInt(e.target.value))}
                    className={cn(
                      "bg-muted rounded-lg appearance-none cursor-pointer accent-primary min-w-[60px] w-full",
                      isMobile ? "h-1.5 flex-1" : "h-2 max-w-[120px]"
                    )}
                  />
                  <span className={cn(
                    "text-foreground font-medium text-center flex-shrink-0",
                    isMobile ? "text-xs w-4" : "text-sm w-5"
                  )}>{inpaintNumGenerations}</span>
                </div>
              </div>

              {/* Create as Variant toggle */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-help">
                      <Layers className={cn(isMobile ? "h-3 w-3" : "h-4 w-4", "text-muted-foreground")} />
                      <Label htmlFor="create-as-variant" className={cn(
                        "font-medium cursor-pointer whitespace-nowrap",
                        isMobile ? "text-[10px] text-muted-foreground" : "text-sm"
                      )}>
                        {isMobile ? 'Variant' : 'Variant'}
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[250px]">
                    <p className="text-xs">
                      <strong>On:</strong> Result appears as a variant of this image.
                      <br />
                      <strong>Off:</strong> Result appears as its own image in the gallery.
                    </p>
                  </TooltipContent>
                </Tooltip>
                <Switch
                  id="create-as-variant"
                  checked={!createAsGeneration}
                  onCheckedChange={(checked) => setCreateAsGeneration(!checked)}
                  className={cn(isMobile && "scale-90")}
                />
              </div>
            </div>
          )}

          {/* Action Buttons - Skip for upscale mode (ImageUpscaleForm has its own) */}
          {editMode !== 'upscale' && (editMode === 'reposition' ? (
            <RepositionButtons
              isMobile={isMobile}
              hasTransformChanges={hasTransformChanges}
              handleSaveAsVariant={handleSaveAsVariant!}
              isSavingAsVariant={isSavingAsVariant}
              saveAsVariantSuccess={saveAsVariantSuccess}
              handleGenerateReposition={handleGenerateReposition!}
              isGeneratingReposition={isGeneratingReposition}
              repositionGenerateSuccess={repositionGenerateSuccess}
            />
          ) : editMode === 'img2img' ? null /* Img2ImgControls renders its own button */ : (
              <GenerateButton
                isMobile={isMobile}
                editMode={editMode ?? 'text'}
                handleUnifiedGenerate={handleUnifiedGenerate}
              handleGenerateAnnotatedEdit={handleGenerateAnnotatedEdit}
              brushStrokes={brushStrokes}
              inpaintPrompt={inpaintPrompt}
              isGeneratingInpaint={isGeneratingInpaint}
              inpaintGenerateSuccess={inpaintGenerateSuccess}
              isCreatingMagicEditTasks={isCreatingMagicEditTasks}
              magicEditTasksCreated={magicEditTasksCreated}
            />
          ))}
      </EditPanelLayout>

      {/* Edit Mode LoRA Selector Modal (for text, inpaint, annotate, reposition modes) */}
      {editLoraManager && (
        <Suspense fallback={null}>
          <LoraSelectorModal
            isOpen={editLoraManager.isLoraModalOpen}
            onClose={() => editLoraManager.setIsLoraModalOpen(false)}
            loras={availableLoras}
            onAddLora={editLoraManager.handleAddLora}
            onRemoveLora={editLoraManager.handleRemoveLora}
            onUpdateLoraStrength={editLoraManager.handleLoraStrengthChange}
            selectedLoras={mapSelectedLorasForModal(editLoraManager.selectedLoras, availableLoras)}
            lora_type="Qwen Edit"
          />
        </Suspense>
      )}
    </>
  );
};
