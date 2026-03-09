import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { writeClipboardTextSafe } from '@/shared/lib/clipboard';
import type { DisplayableMetadata } from '@/shared/types/displayableMetadata';
import { useImageGenerationDetailsViewModel } from './useImageGenerationDetailsViewModel';

// Helper function to map model names to display names
const getModelDisplayName = (modelName: string | undefined): string => {
  if (!modelName) return 'Unknown';
  
  switch (modelName) {
    case 'vace_14B':
      return 'Wan 2.1';
    case 'vace_14B_fake_cocktail_2_2':
      return 'Wan 2.2';
    default:
      return modelName;
  }
};

interface ImageGenerationDetailsProps {
  metadata: DisplayableMetadata;
  variant: 'hover' | 'modal' | 'panel';
  isMobile?: boolean;
  showFullPrompt?: boolean;
  onShowFullPromptChange?: (show: boolean) => void;
  showFullNegativePrompt?: boolean;
  onShowFullNegativePromptChange?: (show: boolean) => void;
  showUserImage?: boolean;
  showCopyButtons?: boolean;
}

export const ImageGenerationDetails: React.FC<ImageGenerationDetailsProps> = ({
  metadata,
  variant,
  isMobile = false,
  showFullPrompt = false,
  onShowFullPromptChange,
  showFullNegativePrompt = false,
  onShowFullNegativePromptChange,
  showUserImage = true,
  showCopyButtons = false,
}) => {
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleCopyPrompt = async (text: string) => {
    const copied = await writeClipboardTextSafe(text);
    if (!copied) return;
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };
  const {
    config,
    prompt,
    negativePrompt,
    model,
    steps,
    hiresScale,
    hiresSteps,
    hiresDenoise,
    lightningPhase1,
    lightningPhase2,
    lorasToDisplay,
    hasAdditionalSettings,
    isQwenImageEdit,
    qwenSourceImage,
    styleReference,
    userProvidedImageFilename,
  } = useImageGenerationDetailsViewModel({
    metadata,
    variant,
    isMobile,
  });

  return (
    <div className={`space-y-3 p-3 bg-muted/30 rounded-lg border ${variant === 'panel' ? '' : 'w-[360px]'}`}>
      {/* Qwen Image Edit Source Image */}
      {showUserImage && isQwenImageEdit && qwenSourceImage && (
        <div className="space-y-2">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Source Image
          </p>
          <div>
            <img 
              src={qwenSourceImage} 
              alt="Source image for edit"
              className="h-auto max-h-24 object-contain object-left rounded-sm border"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* User Provided Image */}
      {showUserImage && metadata.userProvidedImageUrl && !isQwenImageEdit && (
        <div className="space-y-2">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Reference Image
          </p>
          <div className="flex justify-center">
            <img 
              src={metadata.userProvidedImageUrl} 
              alt="User provided image preview"
              className="w-full h-auto max-h-24 object-contain rounded-sm border"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* Style Reference Image Section */}
      {styleReference && (
        <div className="space-y-2">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Reference
          </p>
          <div className="flex items-center gap-3">
            <div
              className="relative group flex-shrink-0"
              style={{ width: `${styleReference.imageWidth}px`, height: `${styleReference.imageHeight}px` }}
            >
              <img
                src={styleReference.image}
                alt="Style reference"
                className="w-full h-full object-cover rounded border shadow-sm transition-transform group-hover:scale-105"
              />
            </div>
            <div className="flex flex-col gap-1 text-left">
              {styleReference.styleStrength !== undefined && (
                <div className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  Style: {Math.round(styleReference.styleStrength * 100)}%
                </div>
              )}
              {styleReference.subjectStrength !== undefined && (
                <div className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  Subject: {Math.round(styleReference.subjectStrength * 100)}%
                </div>
              )}
              {styleReference.sceneStrength !== undefined && (
                <div className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                  Scene: {Math.round(styleReference.sceneStrength * 100)}%
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Prompts and Generation Settings */}
      <div className="grid gap-3 grid-cols-1">
        {/* Prompts Section */}
        <div className="space-y-3">
          {/* Prompt */}
          {prompt ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <p className={`${config.textSize} font-medium text-muted-foreground`}>Prompt</p>
                {showCopyButtons && (
                  <button
                    onClick={() => handleCopyPrompt(prompt)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    title="Copy prompt"
                  >
                    {copiedPrompt ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
              {(() => {
                const shouldTruncate = prompt.length > config.promptLength;
                const displayText = showFullPrompt || !shouldTruncate ? prompt : prompt.slice(0, config.promptLength) + '...';
                return (
                  <div>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed preserve-case`}>
                      "{displayText}"
                    </p>
                    {shouldTruncate && onShowFullPromptChange && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onShowFullPromptChange(!showFullPrompt)}
                        className="h-6 px-0 text-xs text-primary mt-1"
                      >
                        {showFullPrompt ? 'Show Less' : 'Show More'}
                      </Button>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Prompt</p>
              <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>None</p>
            </div>
          )}
          
          {/* Negative Prompt */}
          {negativePrompt && negativePrompt !== 'N/A' ? (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Negative Prompt</p>
              {(() => {
                const shouldTruncate = negativePrompt.length > config.negativePromptLength;
                const displayText = showFullNegativePrompt || !shouldTruncate ? negativePrompt : negativePrompt.slice(0, config.negativePromptLength) + '...';
                return (
                  <div>
                    <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed preserve-case`}>
                      "{displayText}"
                    </p>
                    {shouldTruncate && onShowFullNegativePromptChange && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onShowFullNegativePromptChange(!showFullNegativePrompt)}
                        className="h-6 px-0 text-xs text-primary mt-1"
                      >
                        {showFullNegativePrompt ? 'Show Less' : 'Show More'}
                      </Button>
                    )}
                  </div>
                );
              })()}
            </div>
          ) : negativePrompt ? (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Negative Prompt</p>
              <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>None</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Additional Settings Section */}
      {hasAdditionalSettings && (
        <div className="pt-2 border-t border-muted-foreground/20">
          <div className="space-y-2">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Additional Settings</p>
            <div className={`grid gap-2 ${config.gridCols}`}>
              {metadata.depthStrength !== undefined && (
                <div className="space-y-1">
                  <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Depth Strength</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    {(metadata.depthStrength * 100).toFixed(0)}%
                  </p>
                </div>
              )}
              {metadata.softEdgeStrength !== undefined && (
                <div className="space-y-1">
                  <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Soft Edge Strength</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    {(metadata.softEdgeStrength * 100).toFixed(0)}%
                  </p>
                </div>
              )}
              {userProvidedImageFilename && (
                <div className="space-y-1">
                  <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>Reference Image</p>
                  <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
                    {userProvidedImageFilename}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generation Settings */}
      {(model || steps || hiresScale) && (
        <div className="pt-2 border-t border-muted-foreground/20">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {model && (
              <div className="flex items-center gap-2">
                <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground`}>Model</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>{getModelDisplayName(model)}</p>
              </div>
            )}
            {steps && (
              <div className="flex items-center gap-2">
                <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground`}>Steps</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>{steps}</p>
              </div>
            )}
            {hiresScale && (
              <div className="flex items-center gap-2">
                <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground`}>Hires Scale</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>{hiresScale}x</p>
              </div>
            )}
            {hiresSteps && (
              <div className="flex items-center gap-2">
                <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground`}>Hires Steps</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>{hiresSteps}</p>
              </div>
            )}
            {hiresDenoise !== undefined && (
              <div className="flex items-center gap-2">
                <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground`}>Hires Denoise</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>{hiresDenoise}</p>
              </div>
            )}
            {lightningPhase1 !== undefined && (
              <div className="flex items-center gap-2">
                <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground`}>Lightning P1</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>{lightningPhase1}</p>
              </div>
            )}
            {lightningPhase2 !== undefined && (
              <div className="flex items-center gap-2">
                <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground`}>Lightning P2</p>
                <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>{lightningPhase2}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LoRAs Section */}
      {lorasToDisplay.length > 0 && (
        <div className="pt-2 border-t border-muted-foreground/20">
          <div className="space-y-2">
            <p className={`${config.textSize} ${config.fontWeight} text-muted-foreground ${config.labelCase}`}>LoRAs Used</p>
            <div className="space-y-1">
              {lorasToDisplay.slice(0, config.maxLoras).map((lora, index) => (
                <div key={index} className={`flex items-center justify-between p-1.5 bg-background/50 rounded border ${config.textSize}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`${config.fontWeight} truncate preserve-case`} title={lora.name}>
                      {lora.name.length > config.loraNameLength ? lora.name.slice(0, config.loraNameLength) + '...' : lora.name}
                    </p>
                  </div>
                  <div className={`${config.fontWeight} text-muted-foreground ml-1`}>
                    {lora.strength}
                  </div>
                </div>
              ))}
              {lorasToDisplay.length > config.maxLoras && (
                <p className={`${config.textSize} text-muted-foreground`}>
                  +{lorasToDisplay.length - config.maxLoras} more
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
