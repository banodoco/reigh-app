import React, { Suspense, useRef } from "react";
import { createPortal } from "react-dom";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { BatchImageGenerationTaskParams } from "@/shared/lib/tasks/imageGeneration";

import { PromptsSection } from "./components/PromptsSection";
import { ShotSelector } from "./components/ShotSelector";
import { ModelSection } from "./components/ModelSection";
import { GenerateControls } from "./components/GenerateControls";
import { GenerationSettingsSection } from "./components/GenerationSettingsSection";
import { ChunkLoadErrorBoundary } from "@/shared/components/ChunkLoadErrorBoundary";
import { ImageGenerationFormProvider } from "./ImageGenerationFormContext";
import { useImageGenForm } from "./hooks";

// Lazy load modals to improve initial bundle size and performance
const LazyLoraSelectorModal = React.lazy(() =>
  import("@/shared/components/LoraSelectorModal").then(module => ({
    default: module.LoraSelectorModal
  }))
);

const LazyPromptEditorModal = React.lazy(() =>
  import("../PromptEditorModal")
);

interface ImageGenerationFormProps {
  onGenerate: (params: BatchImageGenerationTaskParams) => Promise<string[]> | string[] | void;
  openaiApiKey?: string;
  /**
   * Called when the associated shot selection changes in the form
   */
  onShotChange?: (shotId: string | null) => void;
  /**
   * When true, the generate controls will be rendered with sticky positioning
   * at the bottom of the scroll container (for modal contexts)
   */
  stickyFooter?: boolean;
  /**
   * When provided with stickyFooter, the footer will be portaled to this element
   * (by ID) so it renders outside the scroll container
   */
  footerPortalId?: string;
  /**
   * Pre-select a specific shot when the form mounts. This takes precedence over
   * persisted settings on initial render only.
   */
  initialShotId?: string | null;
}

export const ImageGenerationForm: React.FC<ImageGenerationFormProps> = ({
  onGenerate,
  openaiApiKey,
  onShotChange,
  stickyFooter = false,
  footerPortalId,
  initialShotId,
}) => {
  const form = useImageGenForm({ onGenerate, openaiApiKey, onShotChange, initialShotId });

  // Remember per-mode imagesPerPrompt so switching modes restores the user's previous value
  const automatedImagesPerPromptRef = useRef(8);
  const managedImagesPerPromptRef = useRef(1);

  return (
    <ImageGenerationFormProvider value={form.contextValue}>
      <form id="image-generation-form" onSubmit={form.handleSubmit} className="space-y-6">
        {/* Main Content Layout */}
        <div className="flex gap-6 flex-col md:flex-row pb-4">
          {/* Left Column - Prompts and Shot Selector */}
          <div className="flex-1 space-y-6">
            <PromptsSection
              onPromptModeChange={(mode) => {
                form.markAsInteracted();
                // Save current imagesPerPrompt to the outgoing mode's slot
                const outgoingMode = form.effectivePromptMode;
                if (outgoingMode === 'automated') {
                  automatedImagesPerPromptRef.current = form.imagesPerPrompt;
                } else if (outgoingMode === 'managed') {
                  managedImagesPerPromptRef.current = form.imagesPerPrompt;
                }
                form.setEffectivePromptMode(mode);
                // Restore imagesPerPrompt from the incoming mode's slot
                if (mode === 'automated') {
                  form.setImagesPerPrompt(automatedImagesPerPromptRef.current);
                } else if (mode === 'managed') {
                  form.setImagesPerPrompt(managedImagesPerPromptRef.current);
                }
              }}
            />

            <ShotSelector
              shots={form.shots}
              associatedShotId={form.associatedShotId}
              isGenerating={form.automatedSubmitButton.isSubmitting}
              onChangeShot={form.handleShotChange}
              onClearShot={() => {
                form.markAsInteracted();
                form.setAssociatedShotId(null);
              }}
              onOpenCreateShot={() => form.uiActions.setCreateShotModalOpen(true)}
              onJumpToShot={form.navigateToShot}
            />
          </div>

          {/* Right Column - Reference Image and Settings */}
          <ModelSection
            // Props not in context
            generationSource={form.generationSource}
            onGenerationSourceChange={form.handleGenerationSourceChange}
            selectedTextModel={form.selectedTextModel}
            onTextModelChange={form.handleTextModelChange}
            onOpenLoraModal={() => form.loraManager.setIsLoraModalOpen(true)}
            isLoadingReferenceData={form.isReferenceDataLoading}
            referenceCount={form.referenceCount}
          />
        </div>

        {/* Generation Settings (dimensions always, phase config for local only) */}
        <div className="md:col-span-2 mt-2">
          <GenerationSettingsSection
            hiresFixConfig={form.hiresFixConfig}
            onHiresFixConfigChange={form.setHiresFixConfig}
            projectResolution={form.projectResolution}
            projectAspectRatio={form.projectAspectRatio}
            disabled={form.automatedSubmitButton.isSubmitting}
            isLocalGeneration={form.isLocalGenerationEnabled}
          />
        </div>

        {/* Spacer to ensure content can scroll above sticky footer (only when not using portal) */}
        {stickyFooter && !footerPortalId && <div className="h-4" />}

        {/* Footer: portaled when footerPortalId provided, sticky when stickyFooter without portal, inline otherwise */}
        {(() => {
          const footerContent = (
            <div className={
              stickyFooter
                ? footerPortalId
                  ? "px-6 py-3 bg-background border-t border-zinc-700" // Portaled footer
                  : "sticky bottom-0 z-50 !mt-0 -mx-6 px-6 py-3 bg-background border-t border-zinc-700" // Sticky footer
                : "border-t border-border pt-6 mt-2" // Inline footer (tool page)
            }>
              <GenerateControls
                imagesPerPrompt={form.imagesPerPrompt}
                onChangeImagesPerPrompt={form.handleSliderChange(form.setImagesPerPrompt)}
                actionablePromptsCount={form.actionablePromptsCount}
                isGenerating={form.automatedSubmitButton.isSubmitting}
                justQueued={form.automatedSubmitButton.isSuccess}
                promptMode={form.effectivePromptMode}
                onUseExistingPrompts={form.handleUseExistingPrompts}
                onNewPromptsLikeExisting={form.handleNewPromptsLikeExisting}
                promptMultiplier={form.promptMultiplier}
                onChangePromptMultiplier={form.setPromptMultiplier}
              />
            </div>
          );

          // Portal footer outside scroll container when footerPortalId is provided
          if (stickyFooter && footerPortalId) {
            const portalTarget = document.getElementById(footerPortalId);
            return portalTarget ? createPortal(footerContent, portalTarget) : footerContent;
          }
          return footerContent;
        })()}
      </form>

      <ChunkLoadErrorBoundary>
        <Suspense fallback={<div className="sr-only">Loading...</div>}>
          <LazyLoraSelectorModal
            isOpen={form.loraManager.isLoraModalOpen}
            onClose={() => form.loraManager.setIsLoraModalOpen(false)}
            loras={form.availableLoras}
            onAddLora={form.handleAddLora}
            onRemoveLora={form.handleRemoveLora}
            onUpdateLoraStrength={form.handleLoraStrengthChange}
            selectedLoras={form.mappedSelectedLoras}
            lora_type={form.loraType}
          />
        </Suspense>
      </ChunkLoadErrorBoundary>

      <ChunkLoadErrorBoundary>
        <Suspense fallback={<div className="sr-only">Loading...</div>}>
          <LazyPromptEditorModal
            isOpen={form.uiState.isPromptModalOpen}
            onClose={() => form.uiActions.closePromptModal()}
            prompts={form.prompts}
            onSave={form.handleSavePromptsFromModal}
            generatePromptId={form.generatePromptId}
            apiKey={form.openaiApiKey}
            openWithAIExpanded={form.uiState.openPromptModalWithAIExpanded}
            onGenerateAndQueue={form.handleGenerateAndQueue}
          />
        </Suspense>
      </ChunkLoadErrorBoundary>

      <CreateShotModal
        isOpen={form.uiState.isCreateShotModalOpen}
        onClose={() => form.uiActions.setCreateShotModalOpen(false)}
        onSubmit={form.handleCreateShot}
        isLoading={form.isCreatingShot}
        projectId={form.selectedProjectId}
      />
    </ImageGenerationFormProvider>
  );
};
