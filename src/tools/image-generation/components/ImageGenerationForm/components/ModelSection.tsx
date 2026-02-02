import React from "react";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { SegmentedControl, SegmentedControlItem } from "@/shared/components/ui/segmented-control";
import { SectionHeader } from "./SectionHeader";
import { ReferenceSection, LoraGrid } from "./reference";
import {
  GenerationSource,
  TextToImageModel,
  TEXT_TO_IMAGE_MODELS,
} from "../types";
import { ActiveLora } from "@/shared/components/ActiveLoRAsDisplay";
import {
  useFormCoreContext,
  useFormReferencesContext,
  useFormLorasContext,
} from "../ImageGenerationFormContext";

export interface ModelSectionProps {
  // Props not in context - generation source and text model selection
  generationSource?: GenerationSource;
  onGenerationSourceChange?: (source: GenerationSource) => void;
  selectedTextModel?: TextToImageModel;
  onTextModelChange?: (model: TextToImageModel) => void;
  // LoRA modal opener (managed by loraManager in parent)
  onOpenLoraModal?: () => void;
  // Loading state for reference data (calculated in parent)
  isLoadingReferenceData?: boolean;
  referenceCount?: number;
}

// Just-text mode content
const JustTextSection: React.FC<{
  isGenerating: boolean;
  selectedTextModel: TextToImageModel;
  onTextModelChange: (model: TextToImageModel) => void;
  selectedLoras: ActiveLora[];
  onOpenLoraModal: () => void;
  onRemoveLora: (loraId: string) => void;
  onUpdateLoraStrength: (loraId: string, strength: number) => void;
}> = ({
  isGenerating,
  selectedTextModel,
  onTextModelChange,
  selectedLoras,
  onOpenLoraModal,
  onRemoveLora,
  onUpdateLoraStrength,
}) => {
  return (
    <div className="space-y-4">
      {/* Model Selector */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Model</Label>
        <RadioGroup
          value={selectedTextModel}
          onValueChange={(value) => onTextModelChange(value as TextToImageModel)}
          className="flex flex-wrap gap-3"
          disabled={isGenerating}
        >
          {TEXT_TO_IMAGE_MODELS.map((model) => (
            <div key={model.id} className="flex items-center space-x-2">
              <RadioGroupItem value={model.id} id={`model-${model.id}`} />
              <Label
                htmlFor={`model-${model.id}`}
                className="cursor-pointer font-normal preserve-case"
                title={model.description}
              >
                {model.name}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* LoRA Grid */}
      <LoraGrid
        selectedLoras={selectedLoras}
        onOpenLoraModal={onOpenLoraModal}
        onRemoveLora={onRemoveLora}
        onUpdateLoraStrength={onUpdateLoraStrength}
        isGenerating={isGenerating}
        isUploadingStyleReference={false}
      />
    </div>
  );
};

export const ModelSection: React.FC<ModelSectionProps> = ({
  // Props not in context
  generationSource = "by-reference",
  onGenerationSourceChange,
  selectedTextModel = "flux-dev",
  onTextModelChange,
  onOpenLoraModal,
  isLoadingReferenceData = false,
  referenceCount = 0,
}) => {
  // Pull from context
  const { isGenerating } = useFormCoreContext();
  const {
    references,
    selectedReferenceId,
    referenceMode,
    styleReferenceStrength,
    subjectStrength,
    subjectDescription,
    inThisSceneStrength,
    styleBoostTerms,
    isUploadingStyleReference,
    styleReferenceImageDisplay: styleReferenceImage,
    onSelectReference,
    onDeleteReference,
    onStyleUpload: onAddReference,
    onStyleStrengthChange,
    onSubjectStrengthChange,
    onSubjectDescriptionChange,
    onSubjectDescriptionFocus,
    onSubjectDescriptionBlur,
    onInThisSceneStrengthChange,
    onReferenceModeChange,
    onStyleBoostTermsChange,
    onToggleVisibility,
    onResourceSelect,
  } = useFormReferencesContext();
  const {
    selectedLoras,
    handleRemoveLora: onRemoveLora,
    handleLoraStrengthChange: onUpdateLoraStrength,
  } = useFormLorasContext();

  // Check if we have multi-reference handlers (always true when using context)
  const hasMultiReferenceSupport = true;

  return (
    <div className="flex-1 space-y-4">
      {/* Header with generation source toggle */}
      <div className="flex flex-row justify-between items-center">
        <SectionHeader title="Settings" theme="purple" />
        {onGenerationSourceChange && (
          <SegmentedControl
            value={generationSource}
            onValueChange={(value) => onGenerationSourceChange(value as GenerationSource)}
            size="sm"
          >
            <SegmentedControlItem value="by-reference">By reference</SegmentedControlItem>
            <SegmentedControlItem value="just-text">Just text</SegmentedControlItem>
          </SegmentedControl>
        )}
      </div>

      {/* Content based on generation source */}
      {generationSource === "by-reference" ? (
        <ReferenceSection
          references={references}
          selectedReferenceId={selectedReferenceId}
          styleReferenceImage={styleReferenceImage}
          referenceCount={referenceCount}
          isLoadingReferenceData={isLoadingReferenceData}
          onSelectReference={onSelectReference}
          onDeleteReference={onDeleteReference}
          onAddReference={onAddReference}
          onResourceSelect={onResourceSelect}
          onToggleVisibility={onToggleVisibility}
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
          selectedLoras={selectedLoras}
          onOpenLoraModal={onOpenLoraModal!}
          onRemoveLora={onRemoveLora}
          onUpdateLoraStrength={onUpdateLoraStrength}
          isGenerating={isGenerating}
          isUploadingStyleReference={isUploadingStyleReference}
        />
      ) : (
        // Just-text mode
        onTextModelChange && onOpenLoraModal && (
          <JustTextSection
            isGenerating={isGenerating}
            selectedTextModel={selectedTextModel}
            onTextModelChange={onTextModelChange}
            selectedLoras={selectedLoras}
            onOpenLoraModal={onOpenLoraModal}
            onRemoveLora={onRemoveLora}
            onUpdateLoraStrength={onUpdateLoraStrength}
          />
        )
      )}
    </div>
  );
};
