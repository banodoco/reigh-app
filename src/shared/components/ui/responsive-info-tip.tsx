import React from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';

interface ResponsiveInfoTipProps {
  isMobile: boolean;
  content: React.ReactNode;
}

export const ResponsiveInfoTip: React.FC<ResponsiveInfoTipProps> = ({
  isMobile,
  content,
}) => {
  if (isMobile) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="absolute top-0 right-0 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 p-0"
          >
            <Info className="h-4 w-4" />
            <span className="sr-only">Info</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64 text-sm" side="left" align="start">
          {content}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
          <Info className="h-4 w-4" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{content}</TooltipContent>
    </Tooltip>
  );
};
