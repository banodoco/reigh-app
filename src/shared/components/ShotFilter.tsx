import React, { RefObject } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Label } from '@/shared/components/ui/primitives/label';
import { Shot } from '@/domains/generation/types';
import { SHOT_FILTER, isSpecialFilter } from '@/shared/constants/filterConstants';
import { cn } from '@/shared/components/ui/contracts/cn';

interface ShotFilterProps {
  shots: Shot[];
  selectedShotId: string;
  onShotChange: (shotId: string) => void;
  excludePositioned: boolean;
  onExcludePositionedChange: (exclude: boolean) => void;
  showPositionFilter?: boolean;
  className?: string;
  triggerClassName?: string;
  triggerWidth?: string;
  labelText?: string;
  positionFilterLabel?: string;
  checkboxId?: string;
  /** Use when component is on a permanently dark surface (e.g., GenerationsPane) */
  darkSurface?: boolean;
  isMobile?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentRef?: RefObject<HTMLDivElement>;
}

export const ShotFilter: React.FC<ShotFilterProps> = ({
  shots,
  selectedShotId,
  onShotChange,
  excludePositioned = true,
  onExcludePositionedChange,
  showPositionFilter = true,
  className = "flex items-center gap-x-3",
  triggerClassName,
  triggerWidth = "w-[180px]",
  labelText,
  positionFilterLabel = "Exclude items with a position",
  checkboxId = "exclude-positioned",
  darkSurface,
  isMobile = false,
  open,
  onOpenChange,
  contentRef,
}) => {
  // Variant selection: zinc for dark surfaces, retro for normal (handles app dark mode automatically)
  const variant = darkSurface ? 'zinc' : 'retro';

  const containerClassName = isMobile
    ? "flex flex-col gap-y-2"
    : className;

  return (
    <div className={containerClassName}>
      <div className={isMobile ? "flex items-center gap-x-3" : "contents"}>
        {labelText && (
          <Label className={cn("text-xs font-light", darkSurface ? "text-white" : "text-foreground")}>
            {labelText}
          </Label>
        )}

        <Select
          value={selectedShotId}
          onValueChange={(value) => {
            if (value) {
              onShotChange(value);
            }
          }}
          open={open}
          onOpenChange={onOpenChange}
        >
          <SelectTrigger
            variant={darkSurface ? "retro-dark" : "retro"}
            colorScheme={darkSurface ? "zinc" : "default"}
            size="sm"
            className={triggerClassName || cn(triggerWidth, "h-6 text-xs")}
          >
            <SelectValue placeholder="Filter by shot..." />
          </SelectTrigger>
          <SelectContent
            variant={variant}
            className="w-max max-h-60 overflow-y-auto text-xs"
            ref={contentRef}
          >
            {/* System filters - muted via opacity */}
            <SelectItem variant={variant} value={SHOT_FILTER.ALL} className="text-xs whitespace-nowrap opacity-70">
              All Shots
            </SelectItem>
            <SelectItem variant={variant} value={SHOT_FILTER.NO_SHOT} className="text-xs whitespace-nowrap opacity-70">
              Items without shots
            </SelectItem>
            {/* Separator */}
            {shots?.length > 0 && (
              <div className="h-px bg-current opacity-20 my-1.5 mx-2" />
            )}
            {/* User shots */}
            {shots?.map(shot => (
              <SelectItem variant={variant} key={shot.id} value={shot.id} className="text-xs whitespace-nowrap preserve-case">
                {shot.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Position filter checkbox - only show when a specific shot is selected */}
      {showPositionFilter && !isSpecialFilter(selectedShotId) && onExcludePositionedChange && (
        <div className="flex items-center gap-x-2 mt-2">
          <Checkbox
            id={checkboxId}
            checked={excludePositioned}
            onCheckedChange={(checked) => onExcludePositionedChange(!!checked)}
            className={darkSurface ? "border-zinc-600 data-[checked]:bg-zinc-600" : undefined}
          />
          <Label
            htmlFor={checkboxId}
            className={cn("text-xs cursor-pointer", darkSurface ? "text-zinc-300" : "text-foreground")}
          >
            {positionFilterLabel}
          </Label>
        </div>
      )}
    </div>
  );
};

export default React.memo(ShotFilter);
