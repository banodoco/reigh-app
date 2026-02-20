import React, { useMemo } from 'react';
import { TaskDetailsProps, getVariantConfig } from '@/shared/types/taskDetailsTypes';
import { parseTaskParams } from '@/shared/utils/taskParamsUtils';
import { ArrowUp, Sparkles } from 'lucide-react';

/**
 * Task details for image enhancement/upscale tasks
 * Shows: upscale factor and denoise level
 */
export const ImageEnhanceDetails: React.FC<TaskDetailsProps> = ({
  task,
  inputImages,
  variant,
  isMobile = false,
}) => {
  const config = getVariantConfig(variant, isMobile, inputImages.length);
  const parsedParams = useMemo(() => parseTaskParams(task?.params) as Record<string, any>, [task?.params]);

  // Extract enhancement settings
  const scaleFactor = typeof parsedParams?.scale_factor === 'number' ? parsedParams.scale_factor : 2;
  const noiseScale = typeof parsedParams?.noise_scale === 'number' ? parsedParams.noise_scale : 0.1;

  return (
    <div className={`p-3 bg-muted/30 rounded-lg border space-y-3 ${variant === 'panel' ? '' : variant === 'modal' && isMobile ? 'w-full' : 'w-[300px]'}`}>
      {/* Enhancement Settings */}
      <div className="space-y-2">
        <p className={`${config.textSize} font-medium text-muted-foreground`}>
          Image Enhancement
        </p>
        <div className="space-y-1.5">
          {/* Upscale factor */}
          <div className={`flex items-center gap-2 p-1.5 bg-background/50 rounded border ${config.textSize}`}>
            <ArrowUp className={config.iconSize} />
            <span className={config.fontWeight}>
              Upscale {scaleFactor}x
            </span>
          </div>

          {/* Denoise level */}
          <div className={`flex items-center gap-2 p-1.5 bg-background/50 rounded border ${config.textSize}`}>
            <Sparkles className={config.iconSize} />
            <span className={config.fontWeight}>
              Denoise: {noiseScale}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
