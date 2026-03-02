import React, { useState, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { Shot } from '@/domains/generation/types';
import SortableShotItem, { type DropOptions } from './SortableShotItem';
import { Button } from '@/shared/components/ui/button';
import { useReorderShots } from '@/shared/hooks/shots';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { cn } from '@/shared/components/ui/contracts/cn';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { Plus, Upload, Loader2 } from 'lucide-react';
import { getDragType, getGenerationDropData, isFileDrag, type GenerationDropData, type DragType } from '@/shared/lib/dnd/dragDrop';
import { isVideoGeneration } from '@/shared/lib/typeGuards';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';
import { useShotFinalVideos } from '../../hooks/video/useShotFinalVideos';
import { useAppEventListener } from '@/shared/lib/typedEvents';

interface ShotListDisplayProps {
  projectId: string;
  onSelectShot: (shot: Shot) => void;
  onCreateNewShot?: () => void;
  shots?: Shot[]; // Optional - if not provided, will use context
  sortMode?: 'ordered' | 'newest' | 'oldest'; // Sort mode for shots
  onSortModeChange?: (mode: 'ordered' | 'newest' | 'oldest') => void; // Callback to change sort mode
  highlightedShotId?: string | null; // Shot to highlight for visual feedback
  // Drop handling for generations from GenerationsPane
  onGenerationDropOnShot?: (shotId: string, data: GenerationDropData, options?: DropOptions) => Promise<void>;
  onGenerationDropForNewShot?: (data: GenerationDropData) => Promise<void>;
  // Drop handling for external files
  onFilesDropForNewShot?: (files: File[]) => Promise<void>;
  onFilesDropOnShot?: (shotId: string, files: File[], options?: DropOptions) => Promise<void>;
  // Expose skeleton setup for modal-based shot creation
  onSkeletonSetupReady?: (setup: (imageCount: number) => void, clear: () => void) => void;
}

const ShotListDisplay: React.FC<ShotListDisplayProps> = ({
  projectId,
  onSelectShot,
  onCreateNewShot,
  shots: propShots,
  sortMode = 'ordered',
  onSortModeChange,
  highlightedShotId,
  onGenerationDropOnShot,
  onGenerationDropForNewShot,
  onFilesDropForNewShot,
  onFilesDropOnShot,
  onSkeletonSetupReady,
}) => {
  // Get hooks first before using them in useMemo
  const { isLoading: shotsLoading, error: shotsError } = useShots();
  const { selectedProjectId: currentProjectId, projects } = useProject();
  const effectiveProjectId = projectId || currentProjectId;
  const currentProject = React.useMemo(
    () => projects.find((project) => project.id === currentProjectId) || null,
    [projects, currentProjectId]
  );
  const reorderShotsMutation = useReorderShots();
  const queryClient = useQueryClient();
  const { finalVideoMap } = useShotFinalVideos(effectiveProjectId);
  const [optimisticShots, setOptimisticShots] = React.useState<Shot[] | null>(null);
  
  // Always use props shots to ensure single source of truth, with optional local optimistic overlay
  // [ShotReorderDebug] Explicitly sort by position, but skip during optimistic updates
  const shots = React.useMemo(() => {
    const baseList = optimisticShots || propShots;
    if (!baseList) return baseList;
    
    // Skip sorting during optimistic updates to allow smooth drag feedback
    if (reorderShotsMutation.isPending) {
      return baseList;
    }
    
    // Apply sorting based on sortMode
    let sorted: Shot[];
    if (sortMode === 'newest') {
      // Sort by created_at descending (newest first)
      sorted = [...baseList].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA;
      });
    } else if (sortMode === 'oldest') {
      // Sort by created_at ascending (oldest first)
      sorted = [...baseList].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB;
      });
    } else {
      // Default 'ordered' mode - sort by persisted shot position
      sorted = [...baseList].sort((a, b) => (a.position || 0) - (b.position || 0));
    }
    
    return sorted;
  }, [propShots, optimisticShots, reorderShotsMutation.isPending, sortMode]);

  // Clear optimistic overlay when mutation settles
  React.useEffect(() => {
    if (!reorderShotsMutation.isPending && optimisticShots) {
      setOptimisticShots(null);
    }
  }, [reorderShotsMutation.isPending, optimisticShots]);
  
  // Check if focus is on an input element to conditionally disable KeyboardSensor
  const [isInputFocused, setIsInputFocused] = React.useState(false);
  
  React.useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const isFormElement = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.contentEditable === 'true';
      setIsInputFocused(isFormElement);
    };
    
    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const isFormElement = target.tagName === 'INPUT' || 
                           target.tagName === 'TEXTAREA' || 
                           target.contentEditable === 'true';
      if (isFormElement) {
        setIsInputFocused(false);
      }
    };
    
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  // Set up sensors for drag and drop
  // Always create the keyboard sensor but conditionally disable it
  const keyboardSensor = useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  });
  
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8, // 8px of movement required before drag starts
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 5,
      },
    }),
    keyboardSensor
  );

  const handleDragStart = (_event: DragStartEvent) => {
    // Prevent drag if an input is focused
    if (isInputFocused) {
      return false;
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !shots || !effectiveProjectId) {
      return;
    }

    if (active.id !== over.id) {
      const oldIndex = shots.findIndex((shot) => shot.id === active.id);
      const newIndex = shots.findIndex((shot) => shot.id === over.id);

      if (oldIndex === -1 || newIndex === -1) {
        return;
      }

      // Create new order array
      const reorderedShots = arrayMove(shots, oldIndex, newIndex);

      // Update positions on the reordered shots
      const shotsWithNewPositions = reorderedShots.map((shot, index) => ({
        ...shot,
        position: index + 1,
      }));

      // Apply local optimistic overlay for immediate visual feedback
      setOptimisticShots(shotsWithNewPositions);

      // Optimistically update the unlimited shots cache (used by ShotsContext -> useListShots(projectId))
      queryClient.setQueryData(shotQueryKeys.list(effectiveProjectId, 0), shotsWithNewPositions);

      // Generate position updates for database
      const shotOrders = reorderedShots.map((shot, index) => ({
        shotId: shot.id,
        position: index + 1,
      }));

      // Update positions in database
      reorderShotsMutation.mutate(
        { projectId: effectiveProjectId, shotOrders },
        {
          onError: (error) => {
            // Revert optimistic updates across all shot-list cache variants for this project.
            queryClient.setQueriesData(
              { queryKey: [...shotQueryKeys.all, effectiveProjectId] },
              shots
            );
            toast.error(`Failed to reorder shots: ${error.message}`);
          },
        }
      );
    }
  };

  // Memoize sortable items
  const sortableItems = React.useMemo(() => {
    if (!shots) return [];
    const items = shots.map((shot) => shot.id);
    return items;
  }, [shots]);

  // Drop state for "New Shot" drop zone
  const [isNewShotDropTarget, setIsNewShotDropTarget] = useState(false);
  const [newShotDropType, setNewShotDropType] = useState<DragType>('none');
  // Processing state for showing loading during upload (legacy - kept for generation drops)
  const [isNewShotProcessing] = useState(false);
  
  // Optimistic skeleton shot state (computed during render like SortableShotItem)
  const pendingNewShotCountRef = useRef(0); // Number of images expected in new shot
  const baselineShotIdsRef = useRef<Set<string> | null>(null); // Shot IDs at drop time
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track newly created shot to transfer pending count to it
  const [newlyCreatedShotId, setNewlyCreatedShotId] = useState<string | null>(null);
  const [newlyCreatedShotExpectedImages, setNewlyCreatedShotExpectedImages] = useState(0);
  const [newlyCreatedShotBaselineNonVideoCount, setNewlyCreatedShotBaselineNonVideoCount] = useState(0);
  
  // Get current shot IDs
  const currentShotIds = React.useMemo(
    () => shots?.map(s => s.id) ?? [],
    [shots]
  );
  const currentShotIdsKey = React.useMemo(() => currentShotIds.join('|'), [currentShotIds]);
  
  // If a new shot appears, transfer expected image count to that shot card.
  // (Must be in an effect—never set state during render.)
  // Note: pendingNewShotCountRef can be 0 for empty shots, so only check baselineShotIdsRef
  React.useEffect(() => {
    if (!baselineShotIdsRef.current) return;
    const baseline = baselineShotIdsRef.current;
    const newShotId = currentShotIds.find(id => !baseline.has(id));
    if (!newShotId) return;

    const expectedImages = pendingNewShotCountRef.current;
    const newShot = shots?.find(s => s.id === newShotId);
    const existingNonVideoCount = (newShot?.images || []).filter(img => !isVideoGeneration(img)).length;
    // Pass *remaining* expected images (avoids forever-skeleton for generation drops where the image already exists)
    const remainingExpectedImages = Math.max(0, expectedImages - existingNonVideoCount);

    setNewlyCreatedShotId(newShotId);
    setNewlyCreatedShotExpectedImages(remainingExpectedImages);
    setNewlyCreatedShotBaselineNonVideoCount(existingNonVideoCount);

    // Clear skeleton-shot refs
    pendingNewShotCountRef.current = 0;
    baselineShotIdsRef.current = null;
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, [currentShotIds, currentShotIdsKey, shots]);

  // Compute pending skeleton shot during render (no flicker)
  // Only show skeleton if the new shot hasn't appeared in the data yet
  // Note: pendingNewShotCountRef can be 0 for empty shots, so check baselineShotIdsRef instead
  let pendingSkeletonShot: { imageCount: number } | null = null;
  if (baselineShotIdsRef.current) {
    const baseline = baselineShotIdsRef.current;
    const newShotAlreadyInData = currentShotIds.some(id => !baseline.has(id));
    if (!newShotAlreadyInData) {
      // Still waiting - show skeleton
      pendingSkeletonShot = { imageCount: pendingNewShotCountRef.current };
    }
  }

  // Handle drag enter for new shot drop zone
  const handleNewShotDragEnter = useCallback((e: React.DragEvent) => {
    const dragType = getDragType(e);
    if (dragType !== 'none' && (onGenerationDropForNewShot || onFilesDropForNewShot)) {
      e.preventDefault();
      e.stopPropagation();
      setIsNewShotDropTarget(true);
      setNewShotDropType(dragType);
    }
  }, [onGenerationDropForNewShot, onFilesDropForNewShot]);

  // Handle drag over for new shot drop zone
  const handleNewShotDragOver = useCallback((e: React.DragEvent) => {
    const dragType = getDragType(e);
    if (dragType !== 'none' && (onGenerationDropForNewShot || onFilesDropForNewShot)) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
      setIsNewShotDropTarget(true);
      setNewShotDropType(dragType);
    }
  }, [onGenerationDropForNewShot, onFilesDropForNewShot]);

  // Handle drag leave for new shot drop zone
  const handleNewShotDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsNewShotDropTarget(false);
      setNewShotDropType('none');
    }
  }, []);

  // Helper to setup optimistic skeleton shot
  const setupPendingNewShot = useCallback((imageCount: number) => {
    baselineShotIdsRef.current = new Set(currentShotIds);
    pendingNewShotCountRef.current = imageCount;
    
    // Safety timeout - clear after 15s
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    safetyTimeoutRef.current = setTimeout(() => {
      pendingNewShotCountRef.current = 0;
      baselineShotIdsRef.current = null;
      safetyTimeoutRef.current = null;
    }, 15000);
  }, [currentShotIds]);
  
  const clearPendingNewShot = useCallback(() => {
    pendingNewShotCountRef.current = 0;
    baselineShotIdsRef.current = null;
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, []);

  // Expose skeleton setup/clear to parent for modal-based shot creation
  React.useEffect(() => {
    if (onSkeletonSetupReady) {
      onSkeletonSetupReady(setupPendingNewShot, clearPendingNewShot);
    }
  }, [onSkeletonSetupReady, setupPendingNewShot, clearPendingNewShot]);

  // Listen for shot-pending-create events (from ShotSelectorWithAdd quick create)
  const handlePendingCreate = useCallback((detail: { imageCount: number }) => {
    setupPendingNewShot(detail.imageCount);
  }, [setupPendingNewShot]);

  const handlePendingCreateClear = useCallback(() => {
    clearPendingNewShot();
  }, [clearPendingNewShot]);

  useAppEventListener('shot-pending-create', handlePendingCreate);
  useAppEventListener('shot-pending-create-clear', handlePendingCreateClear);

  // Handle drop for new shot
  const handleNewShotDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsNewShotDropTarget(false);
    setNewShotDropType('none');

    // Try generation drop first
    const generationData = getGenerationDropData(e);
    if (generationData && onGenerationDropForNewShot) {

      // Show skeleton shot with 1 image
      setupPendingNewShot(1);
      
      try {
        await onGenerationDropForNewShot(generationData);
      } catch (error) {
        normalizeAndPresentError(error, { context: 'ShotDrop', toastTitle: 'Failed to create shot' });
        clearPendingNewShot();
      }
      return;
    }

    // Try file drop
    if (isFileDrag(e) && onFilesDropForNewShot) {
      const files = Array.from(e.dataTransfer.files);
      const validImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      const validFiles = files.filter(file => validImageTypes.includes(file.type));
      
      if (validFiles.length === 0) {
        toast.error('No valid image files. Only JPEG, PNG, and WebP are supported.');
        return;
      }

      // Show skeleton shot with N images
      setupPendingNewShot(validFiles.length);
      
      try {
        await onFilesDropForNewShot(validFiles);
      } catch (error) {
        normalizeAndPresentError(error, { context: 'ShotDrop', toastTitle: 'Failed to create shot' });
        clearPendingNewShot();
      }
    }
  }, [onGenerationDropForNewShot, onFilesDropForNewShot, setupPendingNewShot, clearPendingNewShot]);

  // Show loading skeleton while data is being fetched
  if (shotsLoading || shots === undefined) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-x-6 md:gap-y-5 pb-6 md:pb-8 px-4 pt-4 pb-2 items-start">
        {/* First item: "Create new shot" drop zone skeleton */}
        <div className="p-4 border-2 border-dashed rounded-lg self-start flex flex-col relative animate-pulse">
          {/* Invisible structure to match shot card height */}
          <div className="h-8 mb-3" aria-hidden="true" />
          <div className="grid grid-cols-3 gap-2" aria-hidden="true">
            <div className="aspect-square" />
            <div className="aspect-square" />
            <div className="aspect-square" />
          </div>
          {/* Centered content overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-muted" />
              <div className="h-4 w-24 rounded bg-muted" />
            </div>
          </div>
        </div>
        
        {/* Remaining shot card skeletons */}
        {Array.from({ length: 5 }).map((_, idx) => (
          /* Shot card skeleton - matches VideoShotDisplay structure */
          <div key={idx} className="p-4 border rounded-lg bg-card/50 self-start animate-pulse">
            {/* Header: shot name + action buttons (Video, Pencil, Copy, Trash) */}
            <div className="flex justify-between items-start mb-3">
              <div className="h-7 w-32 bg-muted rounded" />
              <div className="flex items-center gap-x-1">
                <div className="h-8 w-8 bg-muted rounded" />
                <div className="h-8 w-8 bg-muted rounded" />
                <div className="h-8 w-8 bg-muted rounded" />
                <div className="h-8 w-8 bg-muted rounded" />
              </div>
            </div>
            {/* Image grid: 3-column with aspect-square items */}
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

  // Show error state if there's an error loading shots
  if (shotsError) {
    return (
      <div className="py-8">
        <p className="mb-6 text-red-500">Error loading shots: {shotsError.message}</p>
        {onCreateNewShot && (
          <Button onClick={onCreateNewShot}>New Shot</Button>
        )}
      </div>
    );
  }

  // Show empty state only when we definitively have no shots
  if (!shots || shots.length === 0) {
    return (
      <div className="py-8">
        <p className="mb-6">No shots available for this project. You can create one using the button below.</p>
        {onCreateNewShot && (
          <Button onClick={onCreateNewShot}>New Shot</Button>
        )}
      </div>
    );
  }

  // TEMPORARILY DISABLED: Dragging is always disabled (Task 20)
  // To restore: const isDragDisabled = sortMode !== 'ordered' || reorderShotsMutation.isPending;
  const isDragDisabled = true; // Ordered mode & reordering temporarily disabled

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <SortableContext 
        items={sortableItems}
        strategy={rectSortingStrategy}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-x-6 md:gap-y-5 pb-6 md:pb-8 px-4 pt-4 pb-2">
          {/* New Shot Drop Zone - matches collapsed shot card structure for consistent height */}
          {(onGenerationDropForNewShot || onFilesDropForNewShot) && (
            <div
              onDragEnter={handleNewShotDragEnter}
              onDragOver={handleNewShotDragOver}
              onDragLeave={handleNewShotDragLeave}
              onDrop={handleNewShotDrop}
              onClick={isNewShotProcessing ? undefined : onCreateNewShot}
              className={cn(
                'group p-4 border-2 border-dashed rounded-lg transition-all duration-200 flex flex-col self-start relative',
                isNewShotProcessing
                  ? 'border-primary/50 bg-primary/5 cursor-wait'
                  : isNewShotDropTarget 
                    ? 'border-green-500 bg-green-500/10 scale-105 cursor-pointer' 
                    : 'border-border hover:border-[hsl(40,55%,58%)] cursor-pointer'
              )}
            >
              {/* Invisible structure to match shot card height exactly */}
              {/* Header: matches VideoShotDisplay's flex header with h-8 buttons */}
              <div className="h-8 mb-3" aria-hidden="true" />
              {/* Image grid: matches VideoShotDisplay's grid-cols-3 gap-2 with aspect-square items */}
              <div className="grid grid-cols-3 gap-2" aria-hidden="true">
                <div className="aspect-square" />
                <div className="aspect-square" />
                <div className="aspect-square" />
              </div>
              
              {/* Centered content overlay */}
              <div className="absolute inset-0 flex items-center justify-center">
                {isNewShotProcessing ? (
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <span className="text-sm font-medium text-primary">
                      Creating shot...
                    </span>
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
          )}
          
          {/* Skeleton shot card - appears when creating new shot via drop/modal */}
          {pendingSkeletonShot && (
            <div className="p-4 border rounded-lg bg-card/50 opacity-70 animate-pulse self-start">
              {/* Header skeleton (Video, Pencil, Copy, Trash) */}
              <div className="flex justify-between items-start mb-3">
                <div className="h-7 w-32 bg-muted rounded" />
                <div className="flex items-center gap-x-1">
                  <div className="h-8 w-8 bg-muted rounded" />
                  <div className="h-8 w-8 bg-muted rounded" />
                  <div className="h-8 w-8 bg-muted rounded" />
                  <div className="h-8 w-8 bg-muted rounded" />
                </div>
              </div>
              {/* Image grid skeleton */}
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
                    {/* Show "Show All" badge if more than 3 images */}
                    {pendingSkeletonShot.imageCount > 3 && (
                      <div className="absolute bottom-1 right-1 text-xs bg-black/60 text-white px-2 py-0.5 rounded flex items-center gap-1">
                        Show All ({pendingSkeletonShot.imageCount})
                      </div>
                    )}
                  </>
                ) : (
                  /* Empty shot placeholder - 3 empty cells */
                  <>
                    <div className="aspect-square rounded border-2 border-dashed border-border" />
                    <div className="aspect-square rounded border-2 border-dashed border-border" />
                    <div className="aspect-square rounded border-2 border-dashed border-border" />
                  </>
                )}
              </div>
            </div>
          )}
          
          {shots.map((shot, index) => {
            return (
              <SortableShotItem
                key={shot.id}
                shot={shot}
                onSelectShot={() => onSelectShot(shot)}
                onDuplicateShot={() => onSortModeChange?.('newest')}
                currentProjectId={effectiveProjectId}
                isDragDisabled={isDragDisabled}
                disabledReason={sortMode !== 'ordered' ? 'Only available in ordered mode' : undefined}
                shouldLoadImages={true} // Always load images since they're from context
                shotIndex={index}
                projectAspectRatio={currentProject?.aspectRatio}
                isHighlighted={highlightedShotId === shot.id}
                onGenerationDrop={onGenerationDropOnShot}
                onFilesDrop={onFilesDropOnShot}
                initialPendingUploads={shot.id === newlyCreatedShotId ? newlyCreatedShotExpectedImages : 0}
                initialPendingBaselineNonVideoCount={shot.id === newlyCreatedShotId ? newlyCreatedShotBaselineNonVideoCount : undefined}
                onInitialPendingUploadsConsumed={shot.id === newlyCreatedShotId ? () => {
                  setNewlyCreatedShotId(null);
                  setNewlyCreatedShotExpectedImages(0);
                  setNewlyCreatedShotBaselineNonVideoCount(0);
                } : undefined}
                dataTour={index === 0 ? 'first-shot' : undefined}
                finalVideo={finalVideoMap.get(shot.id)}
              />
            );
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
};

export default ShotListDisplay; 
