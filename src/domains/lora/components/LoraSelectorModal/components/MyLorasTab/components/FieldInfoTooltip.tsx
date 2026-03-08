import React from 'react';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';

interface FieldInfoTooltipProps {
  children: React.ReactNode;
}

export const FieldInfoTooltip: React.FC<FieldInfoTooltipProps> = ({ children }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
        <Info className="h-4 w-4" />
      </span>
    </TooltipTrigger>
    <TooltipContent className="max-w-md">
      <div className="text-xs space-y-1">{children}</div>
    </TooltipContent>
  </Tooltip>
);
