import React from "react";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { ReferenceMode } from "../../types";
import { useFormCoreContext, useFormReferencesContext } from "../../ImageGenerationFormContext";

interface ReferenceModeControlsProps {
  hasSelectedReference: boolean;
}

export const ReferenceModeControls: React.FC<ReferenceModeControlsProps> = ({
  hasSelectedReference,
}) => {
  const { isGenerating } = useFormCoreContext();
  const {
    referenceMode,
    onReferenceModeChange,
    styleReferenceStrength,
    subjectStrength,
    inThisSceneStrength,
    onStyleStrengthChange,
    onSubjectStrengthChange,
    onInThisSceneStrengthChange,
    subjectDescription,
    onSubjectDescriptionChange,
    onSubjectDescriptionFocus,
    onSubjectDescriptionBlur,
    styleBoostTerms,
    onStyleBoostTermsChange,
    isUploadingStyleReference,
  } = useFormReferencesContext();
  const isDisabled = isGenerating || isUploadingStyleReference;
  const isSliderDisabled = isDisabled || !hasSelectedReference;

  // Validation helper for custom mode
  const validateStrengthChange = (
    newValue: number,
    otherValues: number[]
  ): boolean => {
    const total = newValue + otherValues.reduce((a, b) => a + b, 0);
    return total >= 0.5;
  };

  return (
    <div className="flex gap-4 flex-col md:flex-row">
      {/* Left column - Reference Mode Selector */}
      <div className="flex-1 space-y-2">
        <Label className="text-sm font-medium">
          How would you like to use this reference?
        </Label>
        <RadioGroup
          value={referenceMode}
          onValueChange={(value) => onReferenceModeChange(value as ReferenceMode)}
          className="flex flex-wrap gap-3"
          disabled={isDisabled}
        >
          <div className="flex items-center gap-x-2">
            <RadioGroupItem value="style" id="mode-style" />
            <Label htmlFor="mode-style" className="cursor-pointer font-normal">
              Style
            </Label>
          </div>
          <div className="flex items-center gap-x-2">
            <RadioGroupItem value="subject" id="mode-subject" />
            <Label htmlFor="mode-subject" className="cursor-pointer font-normal">
              Subject
            </Label>
          </div>
          <div className="flex items-center gap-x-2">
            <RadioGroupItem value="scene" id="mode-scene" />
            <Label htmlFor="mode-scene" className="cursor-pointer font-normal">
              Scene
            </Label>
          </div>
          <div className="flex items-center gap-x-2">
            <RadioGroupItem value="custom" id="mode-custom" />
            <Label htmlFor="mode-custom" className="cursor-pointer font-normal">
              Custom
            </Label>
          </div>
        </RadioGroup>
      </div>

      {/* Right column - Strength sliders and inputs */}
      <div className="flex-1 space-y-4">
        {/* Scene strength slider - only show in scene mode */}
        {referenceMode === "scene" && (
          <SliderWithValue
            label="Scene strength"
            value={inThisSceneStrength}
            onChange={onInThisSceneStrengthChange}
            min={0.0}
            max={2.0}
            step={0.1}
            disabled={isSliderDisabled}
            numberInputClassName="w-16"
          />
        )}

        {/* All three sliders in custom mode */}
        {referenceMode === "custom" && (
          <div className="space-y-3">
            <SliderWithValue
              label="Style strength"
              value={styleReferenceStrength}
              onChange={(value) => {
                if (validateStrengthChange(value, [subjectStrength, inThisSceneStrength])) {
                  onStyleStrengthChange(value);
                }
              }}
              min={0.0}
              max={2.0}
              step={0.1}
              disabled={isSliderDisabled}
              numberInputClassName="w-16"
            />
            <SliderWithValue
              label="Subject strength"
              value={subjectStrength}
              onChange={(value) => {
                if (validateStrengthChange(value, [styleReferenceStrength, inThisSceneStrength])) {
                  onSubjectStrengthChange(value);
                }
              }}
              min={0.0}
              max={2.0}
              step={0.1}
              disabled={isSliderDisabled}
              numberInputClassName="w-16"
            />
            <SliderWithValue
              label="Scene strength"
              value={inThisSceneStrength}
              onChange={(value) => {
                if (validateStrengthChange(value, [styleReferenceStrength, subjectStrength])) {
                  onInThisSceneStrengthChange(value);
                }
              }}
              min={0.0}
              max={2.0}
              step={0.1}
              disabled={isSliderDisabled}
              numberInputClassName="w-16"
            />
          </div>
        )}

        {/* Subject description and style-boost terms for style/subject modes */}
        {hasSelectedReference && (referenceMode === "style" || referenceMode === "subject") && (
          <div className="space-y-4">
            {subjectStrength > 0 && (
              <div className="space-y-2">
                <Label htmlFor="subject-description" className="text-sm font-medium">
                  Which subject from this image?
                </Label>
                <Input
                  id="subject-description"
                  type="text"
                  value={subjectDescription}
                  onChange={(e) => onSubjectDescriptionChange(e.target.value)}
                  onFocus={onSubjectDescriptionFocus}
                  onBlur={onSubjectDescriptionBlur}
                  placeholder="man, woman, cactus"
                  disabled={isSliderDisabled}
                />
              </div>
            )}

            {referenceMode === "style" && (
              <div className="space-y-2">
                <Label htmlFor="style-boost-terms" className="text-sm font-medium">
                  Style-boost terms:
                </Label>
                <Input
                  id="style-boost-terms"
                  type="text"
                  value={styleBoostTerms}
                  onChange={(e) => onStyleBoostTermsChange(e.target.value)}
                  placeholder="oil painting, impressionist"
                  disabled={isSliderDisabled}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
