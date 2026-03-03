import React from 'react';
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
import { useReorderShots } from '@/shared/hooks/shots';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { type GenerationDropData } from '@/shared/lib/dnd/dragDrop';
import { shotQueryKeys } from '@/shared/lib/queryKeys/shots';
import { useShotFinalVideos } from '../../hooks/video/useShotFinalVideos';
import {
  NewShotDropZoneCard,
  PendingSkeletonShotCard,
  ShotListEmptyState,
  ShotListErrorState,
  ShotListLoadingState,
} from './components/ShotListDisplayStates';
import { usePendingNewShotDrop } from './hooks/usePendingNewShotDrop';

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
  const currentShotIds = React.useMemo(() => shots?.map((s) => s.id) ?? [], [shots]);
  const pendingNewShot = usePendingNewShotDrop({
    currentShotIds,
    shots,
    onGenerationDropForNewShot,
    onFilesDropForNewShot,
    onSkeletonSetupReady,
  });

  // Show loading skeleton while data is being fetched
  if (shotsLoading || shots === undefined) {
    return <ShotListLoadingState />;
  }

  // Show error state if there's an error loading shots
  if (shotsError) {
    return <ShotListErrorState errorMessage={shotsError.message} onCreateNewShot={onCreateNewShot} />;
  }

  // Show empty state only when we definitively have no shots
  if (!shots || shots.length === 0) {
    return <ShotListEmptyState onCreateNewShot={onCreateNewShot} />;
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
          {(onGenerationDropForNewShot || onFilesDropForNewShot) && (
            <NewShotDropZoneCard
              isNewShotProcessing={pendingNewShot.isNewShotProcessing}
              isNewShotDropTarget={pendingNewShot.isNewShotDropTarget}
              newShotDropType={pendingNewShot.newShotDropType}
              onDragEnter={pendingNewShot.handleNewShotDragEnter}
              onDragOver={pendingNewShot.handleNewShotDragOver}
              onDragLeave={pendingNewShot.handleNewShotDragLeave}
              onDrop={pendingNewShot.handleNewShotDrop}
              onClick={pendingNewShot.isNewShotProcessing ? undefined : onCreateNewShot}
            />
          )}

          {pendingNewShot.pendingSkeletonShot && (
            <PendingSkeletonShotCard pendingSkeletonShot={pendingNewShot.pendingSkeletonShot} />
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
                initialPendingUploads={shot.id === pendingNewShot.newlyCreatedShotId ? pendingNewShot.newlyCreatedShotExpectedImages : 0}
                initialPendingBaselineNonVideoCount={shot.id === pendingNewShot.newlyCreatedShotId ? pendingNewShot.newlyCreatedShotBaselineNonVideoCount : undefined}
                onInitialPendingUploadsConsumed={shot.id === pendingNewShot.newlyCreatedShotId ? pendingNewShot.clearNewlyCreatedShot : undefined}
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
