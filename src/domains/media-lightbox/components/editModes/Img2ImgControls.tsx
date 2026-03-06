/**
 * Img2ImgControls - Img2Img mode form controls
 *
 * Prompt, strength slider, LoRA selector, and generate button for img2img mode.
 */

import React, { Suspense } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { CheckCircle, Loader2, Plus, Wand2 } from 'lucide-react';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/components/ui/contracts/cn';
import { ActiveLoRAsDisplay } from '@/shared/components/lora/ActiveLoRAsDisplay';
import { LoraSelectorModal, LoraModel } from '@/domains/lora/components/LoraSelectorModal';
import type { UseLoraManagerReturn } from '@/domains/lora/hooks/useLoraManager';

interface Img2ImgControlsProps {
  isMobile: boolean;
  // Form state
  img2imgPrompt: string;
  setImg2imgPrompt: (value: string) => void;
  img2imgStrength: number;
  setImg2imgStrength: (value: number) => void;
  // Generation status
  isGeneratingImg2Img: boolean;
  img2imgGenerateSuccess: boolean;
  handleGenerateImg2Img: () => void;
  // LoRA
  img2imgLoraManager?: UseLoraManagerReturn;
  availableLoras: LoraModel[];
  // Responsive config
  SectionLabel: React.FC<{ children: React.ReactNode }>;
}

export const Img2ImgControls: React.FC<Img2ImgControlsProps> = ({
  isMobile,
  img2imgPrompt,
  setImg2imgPrompt,
  img2imgStrength,
  setImg2imgStrength,
  isGeneratingImg2Img,
  img2imgGenerateSuccess,
  handleGenerateImg2Img,
  img2imgLoraManager,
  availableLoras,
  SectionLabel,
}) => {
  const spacing = isMobile ? 'space-y-2' : 'space-y-4';
  const labelSize = isMobile ? 'text-[10px] uppercase tracking-wide text-muted-foreground' : 'text-sm';
  const textareaMinHeight = isMobile ? 'min-h-[50px]' : 'min-h-[100px]';
  const textareaRows = isMobile ? 2 : 4;
  const textareaPadding = isMobile ? 'px-2 py-1.5' : 'px-3 py-2';
  const textareaTextSize = isMobile ? 'text-base' : 'text-sm';
  const generationsSpacing = isMobile ? 'space-y-0.5' : 'space-y-2';
  const sliderTextSize = isMobile ? 'text-xs' : 'text-sm';
  const buttonSize = isMobile ? 'sm' : 'default';
  const iconSize = isMobile ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <>
      <div className={spacing}>
        {/* Prompt (optional for img2img) */}
        <div className={generationsSpacing}>
          <SectionLabel>Prompt</SectionLabel>
          {!isMobile && <label className={`${labelSize} font-medium`}>Prompt (optional):</label>}
          <Textarea
            value={img2imgPrompt}
            onChange={(e) => setImg2imgPrompt(e.target.value)}
            placeholder={isMobile ? "Describe image..." : "Optional: describe what the transformed image should look like..."}
            className={`w-full ${textareaMinHeight} ${textareaPadding} ${textareaTextSize} resize-none`}
            rows={textareaRows}
            clearable
            onClear={() => setImg2imgPrompt('')}
            voiceInput
            voiceContext="This is an image-to-image prompt. Describe the desired image you want to create. Be specific about the visual result."
            onVoiceResult={(result) => {
              setImg2imgPrompt(result.prompt || result.transcription);
            }}
          />
        </div>

        {/* Strength Slider */}
        <div>
          <SectionLabel>Strength</SectionLabel>
          <div className="flex items-center gap-2">
            {!isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <label className={`${labelSize} font-medium cursor-help`}>Strength:</label>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[200px]">
                  <p className="text-xs">
                    Lower = closer to original, Higher = more transformed
                  </p>
                </TooltipContent>
              </Tooltip>
            )}
            <div className={cn("flex items-center gap-2", isMobile ? "w-full" : "w-[70%]")}>
              <span className={cn(sliderTextSize, "text-muted-foreground", isMobile && "text-[10px]")}>Keep</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={img2imgStrength}
                onChange={(e) => setImg2imgStrength(parseFloat(e.target.value))}
                className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className={cn(sliderTextSize, "text-muted-foreground", isMobile && "text-[10px]")}>Change</span>
              <span className={cn(sliderTextSize, "text-foreground font-medium w-8 text-right", isMobile && "text-xs")}>{Math.round(img2imgStrength * 100)}%</span>
            </div>
          </div>
        </div>

        {/* LoRA Selector */}
        {img2imgLoraManager && (
          <div className={generationsSpacing}>
            <SectionLabel>Style LoRAs</SectionLabel>
            <div className={cn("flex items-center gap-2", isMobile ? "mb-1" : "mb-2")}>
              {!isMobile && <label className={`${labelSize} font-medium`}>LoRAs:</label>}
              <Button
                variant="outline"
                size="sm"
                onClick={() => img2imgLoraManager.setIsLoraModalOpen(true)}
                className={cn("h-10 px-2 text-xs flex flex-col items-center justify-center leading-tight", isMobile && "h-6 text-[10px]")}
              >
                <Plus className={cn(isMobile ? "h-2.5 w-2.5" : "h-3 w-3")} />
                <span className="text-[10px]">LoRA</span>
              </Button>
            </div>

            {/* Display selected LoRAs */}
            {img2imgLoraManager.selectedLoras.length > 0 && (
              <ActiveLoRAsDisplay
                selectedLoras={img2imgLoraManager.selectedLoras}
                onRemoveLora={img2imgLoraManager.handleRemoveLora}
                onLoraStrengthChange={img2imgLoraManager.handleLoraStrengthChange}
                isGenerating={isGeneratingImg2Img}
                availableLoras={availableLoras}
                className={isMobile ? "mt-1" : "mt-2"}
              />
            )}
          </div>
        )}
      </div>

      {/* Generate Button */}
      <Button
        variant="default"
        size={buttonSize as 'sm' | 'default'}
        onClick={handleGenerateImg2Img}
        disabled={isGeneratingImg2Img || img2imgGenerateSuccess}
        className={cn(
          "w-full",
          isMobile && "h-9 text-xs",
          img2imgGenerateSuccess && "bg-green-600 hover:bg-green-600"
        )}
      >
        {isGeneratingImg2Img ? (
          <>
            <Loader2 className={`${iconSize} mr-1.5 animate-spin`} />
            {isMobile ? 'Creating...' : 'Generating...'}
          </>
        ) : img2imgGenerateSuccess ? (
          <>
            <CheckCircle className={`${iconSize} mr-1.5`} />
            {isMobile ? 'Submitted' : 'Submitted, results will appear below'}
          </>
        ) : (
          <>
            <Wand2 className={`${iconSize} mr-1.5`} />
            {isMobile ? 'Transform' : 'Transform Image'}
          </>
        )}
      </Button>

      {/* Img2Img LoRA Selector Modal */}
      {img2imgLoraManager && (
        <Suspense fallback={null}>
          <LoraSelectorModal
            isOpen={img2imgLoraManager.isLoraModalOpen}
            onClose={() => img2imgLoraManager.setIsLoraModalOpen(false)}
            loras={availableLoras}
            onAddLora={img2imgLoraManager.handleAddLora}
            onRemoveLora={img2imgLoraManager.handleRemoveLora}
            onUpdateLoraStrength={img2imgLoraManager.handleLoraStrengthChange}
            selectedLoras={img2imgLoraManager.selectedLoras.map(lora => {
              const fullLora = availableLoras.find(l => l['Model ID'] === lora.id);
              return {
                ...fullLora,
                "Model ID": lora.id,
                Name: lora.name,
                strength: lora.strength,
              } as LoraModel & { strength: number };
            })}
            lora_type="z-image"
          />
        </Suspense>
      )}
    </>
  );
};
