import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/components/ui/contracts/cn';
import { Loader2, Plus, Upload } from 'lucide-react';
import type { DragType } from '@/shared/lib/dnd/dragDrop';
import { ShotCardPlaceholderGrid } from './ShotCardPlaceholderGrid';

export function ShotListLoadingState(): React.ReactElement {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-x-6 md:gap-y-5 pb-6 md:pb-8 px-4 pt-4 pb-2 items-start">
      <div className="p-4 border-2 border-dashed rounded-lg self-start flex flex-col relative animate-pulse">
        <ShotCardPlaceholderGrid />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="h-4 w-24 rounded bg-muted" />
          </div>
        </div>
      </div>

      {Array.from({ length: 5 }).map((_, idx) => (
        <div key={idx} className="p-4 border rounded-lg bg-card/50 self-start animate-pulse">
          <div className="flex justify-between items-start mb-3">
            <div className="h-7 w-32 bg-muted rounded" />
            <div className="flex items-center gap-x-1">
              <div className="h-8 w-8 bg-muted rounded" />
              <div className="h-8 w-8 bg-muted rounded" />
              <div className="h-8 w-8 bg-muted rounded" />
              <div className="h-8 w-8 bg-muted rounded" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="aspect-square bg-muted rounded" />
            <div className="aspect-square bg-muted rounded" />
            <div className="aspect-square bg-muted rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface ShotListErrorStateProps {
  errorMessage: string;
  onCreateNewShot?: () => void;
}

export function ShotListErrorState({
  errorMessage,
  onCreateNewShot,
}: ShotListErrorStateProps): React.ReactElement {
  return (
    <div className="py-8">
      <p className="mb-6 text-red-500">Error loading shots: {errorMessage}</p>
      {onCreateNewShot && <Button onClick={onCreateNewShot}>New Shot</Button>}
    </div>
  );
}

interface ShotListEmptyStateProps {
  onCreateNewShot?: () => void;
}

export function ShotListEmptyState({ onCreateNewShot }: ShotListEmptyStateProps): React.ReactElement {
  return (
    <div className="py-8">
      <p className="mb-6">
        No shots available for this project. You can create one using the button below.
      </p>
      {onCreateNewShot && <Button onClick={onCreateNewShot}>New Shot</Button>}
    </div>
  );
}

interface NewShotDropZoneCardProps {
  isNewShotProcessing: boolean;
  isNewShotDropTarget: boolean;
  newShotDropType: DragType;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onClick?: () => void;
}

export function NewShotDropZoneCard({
  isNewShotProcessing,
  isNewShotDropTarget,
  newShotDropType,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: NewShotDropZoneCardProps): React.ReactElement {
  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      className={cn(
        'group p-4 border-2 border-dashed rounded-lg transition-all duration-200 flex flex-col self-start relative',
        isNewShotProcessing
          ? 'border-primary/50 bg-primary/5 cursor-wait'
          : isNewShotDropTarget
            ? 'border-green-500 bg-green-500/10 scale-105 cursor-pointer'
            : 'border-border hover:border-[hsl(40,55%,58%)] cursor-pointer',
      )}
    >
      <div className="h-8 mb-3" aria-hidden="true" />
      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        <div className="aspect-square" />
        <div className="aspect-square" />
        <div className="aspect-square" />
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        {isNewShotProcessing ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
            <span className="text-sm font-medium text-primary">Creating shot...</span>
          </div>
        ) : isNewShotDropTarget ? (
          <div className="flex flex-col items-center gap-2">
            <Upload className="h-8 w-8 text-green-500 animate-bounce" />
            <span className="text-sm font-medium text-green-500">
              {newShotDropType === 'file' ? 'Drop files to create new shot' : 'Drop to create new shot'}
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="plus-icon-container flex items-center justify-center w-8 h-8 rounded-full border-2 border-dashed border-muted-foreground/50 group-hover:border-[hsl(40,55%,58%)] transition-all duration-200 group-hover:bg-[hsl(40,55%,58%,0.15)] group-hover:shadow-[0_0_16px_hsl(40,55%,58%,0.4)]">
              <Plus className="w-4 h-4 text-muted-foreground group-hover:text-[hsl(40,55%,58%)] transition-all duration-200" />
            </div>
            <p className="text-muted-foreground text-center text-sm group-hover:text-[hsl(40,55%,58%)] transition-colors duration-200">
              Create new shot
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export interface PendingSkeletonShot {
  imageCount: number;
}

interface PendingSkeletonShotCardProps {
  pendingSkeletonShot: PendingSkeletonShot;
}

export function PendingSkeletonShotCard({
  pendingSkeletonShot,
}: PendingSkeletonShotCardProps): React.ReactElement {
  return (
    <div className="p-4 border rounded-lg bg-card/50 opacity-70 animate-pulse self-start">
      <div className="flex justify-between items-start mb-3">
        <div className="h-7 w-32 bg-muted rounded" />
        <div className="flex items-center gap-x-1">
          <div className="h-8 w-8 bg-muted rounded" />
          <div className="h-8 w-8 bg-muted rounded" />
          <div className="h-8 w-8 bg-muted rounded" />
          <div className="h-8 w-8 bg-muted rounded" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 relative">
        {pendingSkeletonShot.imageCount > 0 ? (
          <>
            {Array.from({ length: Math.min(3, pendingSkeletonShot.imageCount) }).map((_, idx) => (
              <div
                key={`skeleton-img-${idx}`}
                className="w-full aspect-square rounded border-2 border-dashed border-primary/30 bg-primary/5 flex items-center justify-center"
              >
                <Loader2 className="h-5 w-5 text-primary/60 animate-spin" />
              </div>
            ))}
            {pendingSkeletonShot.imageCount > 3 && (
              <div className="absolute bottom-1 right-1 text-xs bg-black/60 text-white px-2 py-0.5 rounded flex items-center gap-1">
                Show All ({pendingSkeletonShot.imageCount})
              </div>
            )}
          </>
        ) : (
          <>
            <div className="aspect-square rounded border-2 border-dashed border-border" />
            <div className="aspect-square rounded border-2 border-dashed border-border" />
            <div className="aspect-square rounded border-2 border-dashed border-border" />
          </>
        )}
      </div>
    </div>
  );
}
