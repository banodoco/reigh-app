import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { ExternalLink, FolderPlus, Loader2 } from 'lucide-react';

interface MobileSelectionActionBarProps {
  visible: boolean;
  selectedCount: number;
  isShotsPaneLocked: boolean;
  isTasksPaneLocked: boolean;
  shotsPaneWidth: number;
  tasksPaneWidth: number;
  onDeselect: () => void;
  onDelete: () => void;
  canCreateShot: boolean;
  newShotState: 'idle' | 'loading' | 'success';
  createdShotId: string | null;
  onCreateShot: () => void;
  onJumpToShot: () => void;
}

export function MobileSelectionActionBar({
  visible,
  selectedCount,
  isShotsPaneLocked,
  isTasksPaneLocked,
  shotsPaneWidth,
  tasksPaneWidth,
  onDeselect,
  onDelete,
  canCreateShot,
  newShotState,
  createdShotId,
  onCreateShot,
  onJumpToShot,
}: MobileSelectionActionBarProps): React.ReactElement | null {
  if (!visible || selectedCount < 1) {
    return null;
  }

  const leftOffset = isShotsPaneLocked ? shotsPaneWidth : 0;
  const rightOffset = isTasksPaneLocked ? tasksPaneWidth : 0;

  return (
    <div
      className="fixed z-50 flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-300 pointer-events-none"
      style={{
        left: `${leftOffset}px`,
        right: `${rightOffset}px`,
        paddingLeft: '16px',
        paddingRight: '16px',
        bottom: '64px',
      }}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 pointer-events-auto">
        <span className="text-sm font-light text-gray-700 dark:text-gray-300">{selectedCount} selected</span>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onDeselect} className="text-sm">
            {selectedCount === 1 ? 'Deselect' : 'Deselect All'}
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete} className="text-sm">
            {selectedCount === 1 ? 'Delete' : 'Delete All'}
          </Button>
          {canCreateShot &&
            (newShotState === 'success' && createdShotId ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onJumpToShot}
                className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={onCreateShot}
                disabled={newShotState === 'loading'}
                className="h-8 w-8 text-muted-foreground"
              >
                {newShotState === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderPlus className="h-4 w-4" />
                )}
              </Button>
            ))}
        </div>
      </div>
    </div>
  );
}
