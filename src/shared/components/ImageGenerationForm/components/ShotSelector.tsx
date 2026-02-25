import React, { useMemo } from 'react';
import { Button } from '@/shared/components/ui/button';
import { X } from 'lucide-react';
import type { Shot } from '@/domains/generation/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/shared/components/ui/tooltip';
import { SectionHeader } from './SectionHeader';
import {
  ShotSelector as SharedShotSelector,
  type ShotOption,
} from '@/shared/components/ShotSelector';

interface ShotSelectorProps {
  shots: Shot[] | undefined;
  associatedShotId: string | null;
  isGenerating: boolean;
  onChangeShot: (value: string) => void;
  onClearShot: () => void;
  onOpenCreateShot: () => void;
  onJumpToShot?: (shot: Shot) => void;
}

const NONE_SHOT_ID = '__none__';

export const ShotSelector: React.FC<ShotSelectorProps> = ({
  shots,
  associatedShotId,
  isGenerating,
  onChangeShot,
  onClearShot,
  onOpenCreateShot,
  onJumpToShot,
}) => {
  const options = useMemo<ShotOption[]>(() => {
    const sortedShots = [...(shots ?? [])].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA;
    });

    return [
      { id: NONE_SHOT_ID, name: 'None' },
      ...sortedShots.map((shot) => ({ id: shot.id, name: shot.name })),
    ];
  }, [shots]);

  return (
    <div className="space-y-2 mt-6">
      <div className="flex items-center gap-2">
        <SectionHeader title="Shot" theme="green" htmlFor="associatedShot" />
      </div>

      <div className="flex items-center gap-2">
        {associatedShotId && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onClearShot}
                  disabled={isGenerating}
                  className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  aria-label="Clear shot selection"
                >
                  <X className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>Clear selection</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <SharedShotSelector
          value={associatedShotId ?? NONE_SHOT_ID}
          onValueChange={(value) => {
            if (value === NONE_SHOT_ID) {
              onClearShot();
              return;
            }
            onChangeShot(value);
          }}
          shots={options}
          placeholder="None"
          variant="retro"
          className="flex-1"
          triggerClassName="inline-flex w-full min-w-[200px] justify-between"
          showAddShot
          onCreateShot={onOpenCreateShot}
          isCreatingShot={isGenerating}
          onNavigateToShot={(option) => {
            if (!onJumpToShot || option.id === NONE_SHOT_ID) {
              return;
            }
            const selectedShot = shots?.find((shot) => shot.id === option.id);
            if (selectedShot) {
              onJumpToShot(selectedShot);
            }
          }}
        />
      </div>
    </div>
  );
};
