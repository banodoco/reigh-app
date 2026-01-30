import React, { useState } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { MOBILE_BOTTOM_OFFSET, DESKTOP_BOTTOM_OFFSET } from '../constants';
import { FolderPlus, Check, Loader2 } from 'lucide-react';

interface SelectionActionBarProps {
  selectedCount: number;
  onDeselect: () => void;
  onDelete: () => void;
  onNewShot?: () => Promise<void>;
}

export const SelectionActionBar: React.FC<SelectionActionBarProps> = ({
  selectedCount,
  onDeselect,
  onDelete,
  onNewShot
}) => {
  const [newShotState, setNewShotState] = useState<'idle' | 'loading' | 'success'>('idle');
  const {
    isShotsPaneLocked,
    isTasksPaneLocked,
    shotsPaneWidth,
    tasksPaneWidth
  } = usePanes();
  const isMobile = useIsMobile();

  const handleNewShot = async () => {
    if (!onNewShot || newShotState !== 'idle') return;
    setNewShotState('loading');
    try {
      await onNewShot();
      setNewShotState('success');
      setTimeout(() => setNewShotState('idle'), 2000);
    } catch {
      setNewShotState('idle');
    }
  };
  
  const leftOffset = isShotsPaneLocked ? shotsPaneWidth : 0;
  const rightOffset = isTasksPaneLocked ? tasksPaneWidth : 0;
  const bottomOffset = isMobile ? MOBILE_BOTTOM_OFFSET : DESKTOP_BOTTOM_OFFSET;
  
  return (
    <div
      className="fixed z-50 flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-none"
      style={{
        left: `${leftOffset}px`,
        right: `${rightOffset}px`,
        paddingLeft: '16px',
        paddingRight: '16px',
        bottom: `${bottomOffset}px`,
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 pointer-events-auto">
        <span className="text-sm font-light text-gray-700 dark:text-gray-300">
          {selectedCount} selected
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDeselect}
            className="text-sm"
          >
            {selectedCount === 1 ? 'Deselect' : 'Deselect All'}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={onDelete}
            className="text-sm"
          >
            {selectedCount === 1 ? 'Delete' : 'Delete All'}
          </Button>
          {onNewShot && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleNewShot}
                    disabled={newShotState === 'loading'}
                    className={`h-8 w-8 ${newShotState === 'success' ? 'text-green-600' : 'text-muted-foreground hover:text-foreground'}`}
                  >
                    {newShotState === 'loading' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : newShotState === 'success' ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <FolderPlus className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{newShotState === 'success' ? 'Shot created!' : 'Create a new shot with the selected images'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
    </div>
  );
};

