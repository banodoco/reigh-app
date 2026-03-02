import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Images } from "lucide-react";
import FileInput from "@/shared/components/FileInput";
import { StyleReferenceBrowserModal } from "@/features/resources/components/StyleReferenceBrowserModal";
import { ReferenceGrid } from "./ReferenceGrid";
import { ReferencePreview } from "./ReferencePreview";
import { ReferenceModeControls } from "./ReferenceModeControls";
import { LoraGrid } from "./LoraGrid";
import { useFormCoreContext, useFormReferencesContext } from "../../ImageGenerationFormContext";

interface ReferenceSectionProps {
  onOpenLoraModal: () => void;
  isLoadingReferenceData?: boolean;
  referenceCount?: number;
}

export const ReferenceSection: React.FC<ReferenceSectionProps> = ({
  onOpenLoraModal,
  isLoadingReferenceData = false,
  referenceCount = 0,
}) => {
  const [showDatasetBrowser, setShowDatasetBrowser] = React.useState(false);

  const { isGenerating } = useFormCoreContext();
  const {
    references,
    styleReferenceImageDisplay: styleReferenceImage,
    isUploadingStyleReference,
    onStyleUpload: onAddReference,
    onResourceSelect,
  } = useFormReferencesContext();

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
            hasSelectedReference={hasSelectedReference}
          />

          {/* Grid + Preview layout */}
          <div className="flex gap-4 flex-col md:flex-row">
            {/* Left: Thumbnail grid */}
            <div className="flex-[2]">
              <ReferenceGrid
                onOpenDatasetBrowser={() => setShowDatasetBrowser(true)}
                isLoadingReferenceData={isLoadingReferenceData}
                referenceCount={referenceCount}
              />
            </div>

            {/* Right: Large preview (desktop only) */}
            <div className="flex-1 hidden md:block">
              <ReferencePreview
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
        onOpenLoraModal={onOpenLoraModal}
      />

      {/* Dataset Browser Modal */}
      <StyleReferenceBrowserModal
        isOpen={showDatasetBrowser}
        onOpenChange={setShowDatasetBrowser}
        onResourceSelect={onResourceSelect}
      />
    </div>
  );
};
