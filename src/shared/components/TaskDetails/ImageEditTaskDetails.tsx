import React, { useMemo } from 'react';
import { TaskDetailsProps, getVariantConfig } from '@/shared/types/taskDetailsTypes';
import { parseTaskParams, deriveInputImages, extractLoras } from '@/shared/utils/taskParamsUtils';

/**
 * Task details for image editing tasks (img2img, inpaint, magic edit, etc.)
 * Shows: input image, prompt (if any), strength (for img2img), LoRAs
 */
export const ImageEditTaskDetails: React.FC<TaskDetailsProps> = ({
  task,
  inputImages,
  variant,
  isMobile = false,
}) => {
  const config = getVariantConfig(variant, isMobile, inputImages.length);
  const parsedParams = useMemo(() => parseTaskParams(task?.params), [task?.params]);
  const derivedImages = useMemo(() => deriveInputImages(parsedParams), [parsedParams]);
  const effectiveInputImages = inputImages.length > 0 ? inputImages : derivedImages;
  const loras = useMemo(() => extractLoras(parsedParams), [parsedParams]);

  const prompt = typeof parsedParams?.prompt === 'string' ? parsedParams.prompt : undefined;
  const strength = typeof parsedParams?.strength === 'number' ? parsedParams.strength : undefined;
  const qwenEditModel = typeof parsedParams?.qwen_edit_model === 'string' ? parsedParams.qwen_edit_model : undefined;
  const isImg2Img = task?.taskType === 'z_image_turbo_i2i';

  return (
    <div className={`p-3 bg-muted/30 rounded-lg border space-y-3 ${variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : 'w-[300px]'}`}>
      {/* Input Image */}
      {effectiveInputImages.length > 0 && (
        <div className="space-y-2">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Input Image
          </p>
          <div className="relative group" style={{ width: '120px' }}>
            <img
              src={effectiveInputImages[0]}
              alt="Input image"
              className="w-full object-cover rounded border shadow-sm"
            />
          </div>
        </div>
      )}

      {/* Prompt (if provided) */}
      {prompt && (
        <div className="space-y-1">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Prompt</p>
          <p className={`${config.textSize} ${config.fontWeight} text-foreground break-words whitespace-pre-wrap leading-relaxed preserve-case`}>
            {prompt.length > config.promptLength ? prompt.slice(0, config.promptLength) + '...' : prompt}
          </p>
        </div>
      )}

      {/* Qwen Edit Model (if specified) */}
      {qwenEditModel && (
        <div className="space-y-1">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Model</p>
          <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
            {qwenEditModel}
          </p>
        </div>
      )}

      {/* Img2Img Strength */}
      {isImg2Img && typeof strength === 'number' && (
        <div className="space-y-1">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>Strength</p>
          <p className={`${config.textSize} ${config.fontWeight} text-foreground`}>
            {strength.toFixed(2)}
          </p>
        </div>
      )}

      {/* LoRAs */}
      {loras.length > 0 && (
        <div className="space-y-1.5">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>LoRAs</p>
          <div className="space-y-1">
            {loras.slice(0, config.maxLoras).map((lora, idx) => (
              <div key={idx} className={`flex items-center justify-between p-1.5 bg-background/50 rounded border ${config.textSize}`}>
                <span className={`${config.fontWeight} truncate preserve-case`} title={lora.displayName}>
                  {lora.displayName.length > config.loraNameLength
                    ? lora.displayName.slice(0, config.loraNameLength) + '...'
                    : lora.displayName}
                </span>
                <span className="text-muted-foreground ml-1">{lora.strength}</span>
              </div>
            ))}
            {loras.length > config.maxLoras && (
              <p className={`${config.textSize} text-muted-foreground`}>
                +{loras.length - config.maxLoras} more
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
