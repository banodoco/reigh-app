import React from "react";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { SegmentedControl, SegmentedControlItem } from "@/shared/components/ui/segmented-control";
import { SectionHeader } from "./SectionHeader";
import { ReferenceSection } from "./reference";
import { LoraGrid } from "./reference/LoraGrid";
import {
  GenerationSource,
  TextToImageModel,
  TEXT_TO_IMAGE_MODELS,
} from "../types";
import {
  useFormCoreContext,
} from "../ImageGenerationFormContext";

interface ModelSectionProps {
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
  selectedTextModel: TextToImageModel;
  onTextModelChange: (model: TextToImageModel) => void;
  onOpenLoraModal: () => void;
}> = ({
  selectedTextModel,
  onTextModelChange,
  onOpenLoraModal,
}) => {
  const { isGenerating } = useFormCoreContext();

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
            <div key={model.id} className="flex items-center gap-x-2">
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
        onOpenLoraModal={onOpenLoraModal}
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
          onOpenLoraModal={onOpenLoraModal!}
          referenceCount={referenceCount}
          isLoadingReferenceData={isLoadingReferenceData}
        />
      ) : (
        // Just-text mode
        onTextModelChange && onOpenLoraModal && (
          <JustTextSection
            selectedTextModel={selectedTextModel}
            onTextModelChange={onTextModelChange}
            onOpenLoraModal={onOpenLoraModal}
          />
        )
      )}
    </div>
  );
};
