import React from "react";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { SegmentedControl, SegmentedControlItem } from "@/shared/components/ui/segmented-control";
import { SectionHeader } from "./SectionHeader";
import { ReferenceSection, LoraGrid } from "./reference";
import {
  HydratedReferenceImage,
  ReferenceMode,
  GenerationSource,
  TextToImageModel,
  TEXT_TO_IMAGE_MODELS,
} from "../types";
import { Resource } from "@/shared/hooks/useResources";
import { ActiveLora } from "@/shared/components/ActiveLoRAsDisplay";

export interface ModelSectionProps {
  isGenerating: boolean;
  isUploadingStyleReference: boolean;
  // Reference data
  references?: HydratedReferenceImage[];
  selectedReferenceId?: string | null;
  styleReferenceImage: string | null;
  referenceCount?: number;
  isLoadingReferenceData?: boolean;
  // Reference actions
  onSelectReference?: (id: string) => void;
  onDeleteReference?: (id: string) => void;
  onStyleUpload: (files: File[]) => void;
  onStyleRemove: () => void;
  onResourceSelect?: (resource: Resource) => void;
  onToggleVisibility?: (resourceId: string, currentIsPublic: boolean) => void;
  // Mode and strengths
  referenceMode?: ReferenceMode;
  onReferenceModeChange?: (mode: ReferenceMode) => void;
  styleReferenceStrength: number;
  subjectStrength: number;
  inThisSceneStrength: number;
  onStyleStrengthChange: (value: number) => void;
  onSubjectStrengthChange: (value: number) => void;
  onInThisSceneStrengthChange: (value: number) => void;
  // Subject description
  subjectDescription: string;
  onSubjectDescriptionChange: (value: string) => void;
  onSubjectDescriptionFocus?: () => void;
  onSubjectDescriptionBlur?: () => void;
  // Style boost terms
  styleBoostTerms?: string;
  onStyleBoostTermsChange?: (value: string) => void;
  // Generation source toggle
  generationSource?: GenerationSource;
  onGenerationSourceChange?: (source: GenerationSource) => void;
  // Just-text mode props
  selectedTextModel?: TextToImageModel;
  onTextModelChange?: (model: TextToImageModel) => void;
  // LoRAs
  selectedLoras?: ActiveLora[];
  onOpenLoraModal?: () => void;
  onRemoveLora?: (loraId: string) => void;
  onUpdateLoraStrength?: (loraId: string, strength: number) => void;
  // Legacy props (unused in new structure but kept for compatibility)
  inThisScene?: boolean;
  onInThisSceneChange?: (value: boolean) => void;
  onUpdateReferenceName?: (id: string, name: string) => void;
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
  isGenerating,
  isUploadingStyleReference,
  // Reference data
  references = [],
  selectedReferenceId = null,
  styleReferenceImage,
  referenceCount = 0,
  isLoadingReferenceData = false,
  // Reference actions
  onSelectReference,
  onDeleteReference,
  onStyleUpload,
  onResourceSelect,
  onToggleVisibility,
  // Mode and strengths
  referenceMode = "style",
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
  styleBoostTerms = "",
  onStyleBoostTermsChange,
  // Generation source
  generationSource = "by-reference",
  onGenerationSourceChange,
  // Just-text mode
  selectedTextModel = "flux-dev",
  onTextModelChange,
  // LoRAs
  selectedLoras = [],
  onOpenLoraModal,
  onRemoveLora,
  onUpdateLoraStrength,
}) => {
  // Check if we have multi-reference handlers
  const hasMultiReferenceSupport = !!(onSelectReference && onDeleteReference);

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
        hasMultiReferenceSupport && onReferenceModeChange && onStyleBoostTermsChange && onResourceSelect ? (
          <ReferenceSection
            references={references}
            selectedReferenceId={selectedReferenceId}
            styleReferenceImage={styleReferenceImage}
            referenceCount={referenceCount}
            isLoadingReferenceData={isLoadingReferenceData}
            onSelectReference={onSelectReference}
            onDeleteReference={onDeleteReference}
            onAddReference={onStyleUpload}
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
            onRemoveLora={onRemoveLora!}
            onUpdateLoraStrength={onUpdateLoraStrength!}
            isGenerating={isGenerating}
            isUploadingStyleReference={isUploadingStyleReference}
          />
        ) : (
          // Fallback: minimal reference UI when handlers not provided
          <div className="text-sm text-muted-foreground">
            Reference mode requires additional configuration.
          </div>
        )
      ) : (
        // Just-text mode
        onTextModelChange && onOpenLoraModal && onRemoveLora && onUpdateLoraStrength && (
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
