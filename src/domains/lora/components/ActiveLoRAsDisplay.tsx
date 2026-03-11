import React from 'react';
import { X, Plus } from 'lucide-react';
import { HoverScrubVideo } from '@/shared/components/HoverScrubVideo';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { SliderWithValue } from '@/shared/components/ui/slider-with-value';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { getDisplayNameFromUrl, type LoraDisplayModel } from '@/domains/lora/lib/loraUtils';
import type { ActiveLora } from '@/domains/lora/types/lora';

interface ActiveLoRAsDisplayProps {
  selectedLoras: ActiveLora[];
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, newStrength: number) => void;
  isGenerating?: boolean;
  availableLoras?: LoraDisplayModel[];
  className?: string;
  onAddTriggerWord?: (triggerWord: string) => void;
  renderHeaderActions?: () => React.ReactNode;
}

const ActiveLoRAsDisplayComponent: React.FC<ActiveLoRAsDisplayProps> = ({
  selectedLoras,
  onRemoveLora,
  onLoraStrengthChange,
  isGenerating = false,
  availableLoras = [],
  className = "",
  onAddTriggerWord,
  renderHeaderActions,
}) => {
  return (
    <div className={`space-y-4 ${className}`}>
      {renderHeaderActions && (
        <div className="flex items-center justify-start">
          {renderHeaderActions()}
        </div>
      )}

      {selectedLoras.length === 0 ? (
        <div className="p-4 border rounded-md shadow-sm bg-muted/50 text-center">
          <p className="text-sm text-muted-foreground">None selected</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
          {selectedLoras.map((lora) => {
            const isVideo = lora.previewImageUrl && (
              lora.previewImageUrl.match(/\.(mp4|webm|mov|avi)(\?|$)/i) ||
              availableLoras.find((item) => item["Model ID"] === lora.id)?.Images?.some((image) => image.type?.startsWith('video'))
            );
            const displayName = getDisplayNameFromUrl(lora.path, availableLoras, lora.name);

            return (
              <div key={lora.id} className="p-3 border rounded-md shadow-sm bg-muted/50">
                <div className="flex items-start gap-3 mb-3">
                  {lora.previewImageUrl && (
                    <div className="h-16 w-16 flex-shrink-0">
                      {isVideo ? (
                        <HoverScrubVideo
                          src={lora.previewImageUrl}
                          className="h-16 w-16 object-cover rounded-md border"
                          videoClassName="object-cover"
                          autoplayOnHover
                          loop
                          muted
                        />
                      ) : (
                        <img
                          src={lora.previewImageUrl}
                          alt={`Preview for ${displayName}`}
                          className="h-16 w-16 object-cover rounded-md border"
                        />
                      )}
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex-grow min-w-0">
                        <Label htmlFor={`lora-strength-${lora.id}`} className="text-sm font-light truncate pr-2 block preserve-case">
                          {displayName}
                        </Label>
                        {(() => {
                          const triggerWord = lora.trigger_word ||
                            availableLoras.find((item) => item["Model ID"] === lora.id)?.trigger_word;

                          return triggerWord ? (
                            <div className="flex items-center mt-0.5">
                              <p className="text-xs text-muted-foreground">
                                Trigger words: <span className="font-mono text-foreground">"{triggerWord}"</span>
                                {onAddTriggerWord && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => onAddTriggerWord(triggerWord)}
                                        className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground ml-1 inline-flex translate-y-0.5"
                                        disabled={isGenerating}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Add after prompt</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </p>
                            </div>
                          ) : null;
                        })()}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveLora(lora.id)}
                        className="text-destructive hover:bg-destructive/10 h-7 w-7 flex-shrink-0 ml-2"
                        disabled={isGenerating}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <SliderWithValue
                  label="Strength"
                  value={lora.strength}
                  onChange={(newStrength) => onLoraStrengthChange(lora.id, newStrength)}
                  min={0}
                  max={2}
                  step={0.05}
                  disabled={isGenerating}
                  variant="secondary"
                  hideLabel={true}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const ActiveLoRAsDisplay = React.memo(ActiveLoRAsDisplayComponent);
