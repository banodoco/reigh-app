import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Settings } from 'lucide-react';
import { ShotSelectorControls } from './ShotSelectorControls';
import type { LightboxDeleteHandler } from '../types';
import type { ShotSelectorControlsProps } from './ShotSelectorControls';

export interface WorkflowControlsBarProps {
  core: {
    onDelete?: LightboxDeleteHandler;
    onApplySettings?: (metadata: Record<string, unknown>) => void;
    isSpecialEditMode: boolean;
    isVideo: boolean;
    handleApplySettings: () => void;
  };
  shotSelector?: ShotSelectorControlsProps;
}

/**
 * WorkflowControlsBar Component
 * The bottom bar containing shot selector controls and apply settings button
 * Used across all layout variants (Desktop Side Panel, Mobile Stacked, Regular)
 */
export const WorkflowControlsBar: React.FC<WorkflowControlsBarProps> = ({
  core,
  shotSelector,
}) => {
  if (core.isSpecialEditMode || !(shotSelector || core.onDelete || core.onApplySettings)) {
    return null;
  }

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex items-center gap-x-2 z-[60]">
      <div className="bg-black/50 backdrop-blur-sm rounded-lg px-1.5 py-1 flex items-center gap-x-2">
        {/* Shot Selection and Add to Shot */}
        {shotSelector && shotSelector.allShots.length > 0 && !core.isVideo && (
          <ShotSelectorControls {...shotSelector} />
        )}

        {/* Apply Settings */}
        {core.onApplySettings && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="secondary"
                size="sm"
                onClick={core.handleApplySettings}
                className="bg-purple-600/80 hover:bg-purple-600 text-white h-8 px-3"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="z-[100001]">Apply settings</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
};
