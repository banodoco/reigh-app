import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { Images, Plus, X } from "lucide-react";
import HoverScrubVideo from "@/shared/components/HoverScrubVideo";
import { getDisplayNameFromUrl } from "@/shared/lib/loraUtils";
import { useFormCoreContext, useFormLorasContext } from "../../ImageGenerationFormContext";

interface LoraGridProps {
  onOpenLoraModal: () => void;
}

export const LoraGrid: React.FC<LoraGridProps> = ({
  onOpenLoraModal,
}) => {
  const { isGenerating } = useFormCoreContext();
  const {
    selectedLoras,
    handleRemoveLora: onRemoveLora,
    handleLoraStrengthChange: onUpdateLoraStrength,
  } = useFormLorasContext();
  return (
    <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">
          LoRAs {selectedLoras.length > 0 && `(${selectedLoras.length})`}
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpenLoraModal}
          disabled={isGenerating}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add LoRA
        </Button>
      </div>

      {selectedLoras.length > 0 ? (
        <div className="grid grid-cols-2 gap-3">
          {selectedLoras.map((lora) => {
            const isVideo =
              lora.previewImageUrl &&
              lora.previewImageUrl.match(/\.(mp4|webm|mov|avi)(\?|$)/i);

            return (
              <div
                key={lora.id}
                className="relative group rounded-lg border bg-muted/30 overflow-hidden"
              >
                <div className="aspect-video relative">
                  {lora.previewImageUrl ? (
                    isVideo ? (
                      <HoverScrubVideo
                        src={lora.previewImageUrl}
                        className="w-full h-full object-cover"
                        videoClassName="object-cover"
                        autoplayOnHover
                        loop
                        muted
                      />
                    ) : (
                      <img
                        src={lora.previewImageUrl}
                        alt={lora.name}
                        className="w-full h-full object-cover"
                      />
                    )
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <Images className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => onRemoveLora(lora.id)}
                    disabled={isGenerating}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>

                <div className="p-2 space-y-2">
                  <p
                    className="text-xs font-medium truncate preserve-case"
                    title={getDisplayNameFromUrl(lora.path, undefined, lora.name)}
                  >
                    {getDisplayNameFromUrl(lora.path, undefined, lora.name)}
                  </p>
                  <SliderWithValue
                    label="Strength"
                    value={lora.strength}
                    onChange={(value) => onUpdateLoraStrength(lora.id, value)}
                    min={0}
                    max={2}
                    step={0.05}
                    disabled={isGenerating}
                    hideLabel
                    numberInputClassName="w-14"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">
          No LoRAs selected. Add LoRAs to customize the generation style.
        </p>
      )}
    </div>
  );
};
