import React, { useMemo } from 'react';
import { TaskDetailsProps, getVariantConfig } from '@/shared/types/taskDetailsTypes';
import { parseTaskParams } from '@/shared/lib/taskParamsUtils';
import { ArrowUp, Sparkles } from 'lucide-react';
import { TaskDetailsEnhancementSection } from '@/shared/components/TaskDetails/components/TaskDetailsEnhancementSection';
import { getTaskDetailsCardClassName } from '@/shared/components/TaskDetails/lib/taskDetailsLayout';

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
  const parsedParams = useMemo(() => parseTaskParams(task?.params), [task?.params]);

  // Extract enhancement settings
  const scaleFactor = typeof parsedParams?.scale_factor === 'number' ? parsedParams.scale_factor : 2;
  const noiseScale = typeof parsedParams?.noise_scale === 'number' ? parsedParams.noise_scale : 0.1;
  const rows = [
    {
      key: 'upscale',
      icon: ArrowUp,
      label: `Upscale ${scaleFactor}x`,
    },
    {
      key: 'denoise',
      icon: Sparkles,
      label: `Denoise: ${noiseScale}`,
    },
  ];

  return (
    <div
      className={getTaskDetailsCardClassName({
        variant,
        isMobile,
        widthClassName: 'w-[300px]',
      })}
    >
      <TaskDetailsEnhancementSection
        title="Image Enhancement"
        textSize={config.textSize}
        fontWeight={config.fontWeight}
        iconSize={config.iconSize}
        rows={rows}
      />
    </div>
  );
};
