import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Images } from "lucide-react";
import FileInput from "@/shared/components/FileInput";
import { DatasetBrowserModal } from "@/shared/components/DatasetBrowserModal";
import { ReferenceSectionProps } from "./types";
import { ReferenceGrid } from "./ReferenceGrid";
import { ReferencePreview } from "./ReferencePreview";
import { ReferenceModeControls } from "./ReferenceModeControls";
import { LoraGrid } from "./LoraGrid";

export const ReferenceSection: React.FC<ReferenceSectionProps> = ({
  // Reference data
  references,
  selectedReferenceId,
  styleReferenceImage,
  referenceCount,
  isLoadingReferenceData,
  // Reference actions
  onSelectReference,
  onDeleteReference,
  onAddReference,
  onResourceSelect,
  onToggleVisibility,
  // Mode and strengths
  referenceMode,
  onReferenceModeChange,
  styleReferenceStrength,
  subjectStrength,
  inThisSceneStrength,
  onStyleStrengthChange,
  onSubjectStrengthChange,
  onInThisSceneStrengthChange,
  // Subject description
  subjectDescription,
  onSubjectDescriptionChange,
  onSubjectDescriptionFocus,
  onSubjectDescriptionBlur,
  // Style boost terms
  styleBoostTerms,
  onStyleBoostTermsChange,
  // LoRAs
  selectedLoras,
  onOpenLoraModal,
  onRemoveLora,
  onUpdateLoraStrength,
  // Disabled state
  isGenerating,
  isUploadingStyleReference,
}) => {
  const [showDatasetBrowser, setShowDatasetBrowser] = React.useState(false);

  // Determine which UI state to show
  const hasReferences = referenceCount > 0 || references.length > 0;
  const hasSelectedReference = !!styleReferenceImage;

  return (
    <div className="space-y-4">
      {hasReferences ? (
        // Main UI: mode controls + grid + preview
        <>
          {/* Mode selector and strength controls */}
          <ReferenceModeControls
            referenceMode={referenceMode}
            onReferenceModeChange={onReferenceModeChange}
            styleReferenceStrength={styleReferenceStrength}
            subjectStrength={subjectStrength}
            inThisSceneStrength={inThisSceneStrength}
            onStyleStrengthChange={onStyleStrengthChange}
            onSubjectStrengthChange={onSubjectStrengthChange}
            onInThisSceneStrengthChange={onInThisSceneStrengthChange}
            subjectDescription={subjectDescription}
            onSubjectDescriptionChange={onSubjectDescriptionChange}
            onSubjectDescriptionFocus={onSubjectDescriptionFocus}
            onSubjectDescriptionBlur={onSubjectDescriptionBlur}
            styleBoostTerms={styleBoostTerms}
            onStyleBoostTermsChange={onStyleBoostTermsChange}
            hasSelectedReference={hasSelectedReference}
            isGenerating={isGenerating}
            isUploadingStyleReference={isUploadingStyleReference}
          />

          {/* Grid + Preview layout */}
          <div className="flex gap-4 flex-col md:flex-row">
            {/* Left: Thumbnail grid */}
            <div className="flex-[2]">
              <ReferenceGrid
                references={references}
                selectedReferenceId={selectedReferenceId}
                onSelectReference={onSelectReference}
                onAddReference={onAddReference}
                onDeleteReference={onDeleteReference}
                onToggleVisibility={onToggleVisibility}
                onOpenDatasetBrowser={() => setShowDatasetBrowser(true)}
                isGenerating={isGenerating}
                isUploadingStyleReference={isUploadingStyleReference}
                isLoadingReferenceData={isLoadingReferenceData}
                referenceCount={referenceCount}
              />
            </div>

            {/* Right: Large preview (desktop only) */}
            <div className="flex-1 hidden md:block">
              <ReferencePreview
                imageUrl={styleReferenceImage}
                isLoadingReferenceData={isLoadingReferenceData}
              />
            </div>
          </div>
        </>
      ) : (
        // Empty state: no references yet
        <div className="space-y-3">
          <FileInput
            onFileChange={onAddReference}
            acceptTypes={["image"]}
            disabled={isGenerating || isUploadingStyleReference}
            label="Upload your first reference image"
            className="w-full"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowDatasetBrowser(true)}
            disabled={isGenerating || isUploadingStyleReference}
            className="w-full"
          >
            <Images className="h-4 w-4 mr-2" />
            Browse images
          </Button>
        </div>
      )}

      {/* LoRA Grid */}
      <LoraGrid
        selectedLoras={selectedLoras}
        onOpenLoraModal={onOpenLoraModal}
        onRemoveLora={onRemoveLora}
        onUpdateLoraStrength={onUpdateLoraStrength}
        isGenerating={isGenerating}
        isUploadingStyleReference={isUploadingStyleReference}
      />

      {/* Dataset Browser Modal */}
      <DatasetBrowserModal
        isOpen={showDatasetBrowser}
        onOpenChange={setShowDatasetBrowser}
        onResourceSelect={onResourceSelect}
      />
    </div>
  );
};
