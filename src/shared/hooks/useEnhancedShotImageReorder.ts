import { useCallback, useRef } from 'react';
import { useTimelineCore } from './useTimelineCore';
import { toast } from '@/shared/components/ui/sonner';
import { analyzeReorderOperation, validateReorderAnalysis } from '@/shared/utils/reorderUtils';
import { handleError } from '@/shared/lib/errorHandler';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import { GenerationRow } from '@/types/shots';

/**
 * Enhanced hook for handling shot image reordering with position exchange support
 * Now accepts parent hook functions to avoid duplicate data sources
 */
export const useEnhancedShotImageReorder = (
  shotId: string | null,
  parentHook?: {
    shotGenerations: GenerationRow[];
    getImagesForMode: (mode: 'batch' | 'timeline') => GenerationRow[];
    exchangePositions: (genIdA: string, genIdB: string) => Promise<void>;
    exchangePositionsNoReload: (shotGenIdA: string, shotGenIdB: string) => Promise<void>;
    batchExchangePositions: (exchanges: Array<{ generationIdA: string; generationIdB: string }>) => Promise<void>;
    deleteItem: (genId: string) => Promise<void>;
    loadPositions: (opts?: { reason?: string }) => Promise<void>;
    isLoading: boolean;
    moveItemsToMidpoint?: (draggedItemIds: string[], newStartIndex: number, allItems: Array<{ id: string; timeline_frame: number | null }>) => Promise<void>;
  }
) => {
  // Use parent hook functions if provided, otherwise create own instance
  const coreHook = useTimelineCore(parentHook ? null : shotId);

  // Map core hook to expected interface
  const ownHook = {
    shotGenerations: coreHook.positionedItems,
    getImagesForMode: () => coreHook.positionedItems,
    exchangePositions: async () => {},
    deleteItem: coreHook.deleteItem,
    loadPositions: coreHook.refetch,
    isLoading: coreHook.isLoading,
  };

  const ownBatchReorder = {
    batchExchangePositions: coreHook.commitPositions,
    exchangePositionsNoReload: async (idA: string, idB: string) => {
      // For no-reload swaps, we need to implement swap logic
      // This is a simplified version - swap frame values
      const itemA = coreHook.positionedItems.find(i => i.shotImageEntryId === idA);
      const itemB = coreHook.positionedItems.find(i => i.shotImageEntryId === idB);
      if (itemA && itemB) {
        await coreHook.commitPositions([
          { shotGenerationId: idA, newFrame: itemB.timeline_frame ?? 0 },
          { shotGenerationId: idB, newFrame: itemA.timeline_frame ?? 0 },
        ]);
      }
    },
  };
  
  // 🔧 FIX: Use ref to always access latest parentHook in callbacks
  // This prevents stale closure bugs where handleReorder captured old parentHook
  const parentHookRef = useRef(parentHook);
  parentHookRef.current = parentHook;
  
  const {
    shotGenerations,
    getImagesForMode,
    deleteItem,
    loadPositions,
    isLoading
  } = parentHook || ownHook;
  
  const {
    exchangePositionsNoReload
  } = parentHook ? {
    batchExchangePositions: parentHook.batchExchangePositions,
    exchangePositionsNoReload: parentHook.exchangePositionsNoReload
  } : ownBatchReorder;

  // Handle drag and drop reordering in batch mode - Timeline-frame-based swapping
  const handleReorder = useCallback(async (orderedShotImageEntryIds: string[], draggedItemId?: string) => {
    
    if (!shotId || orderedShotImageEntryIds.length === 0) {
      return;
    }

    try {
      // Get current images and their timeline_frame values
      const currentImages = getImagesForMode('batch');
      // img.id is shot_generations.id - unique per entry
      const currentOrder = currentImages.map(img => img.id);
      
      // Detect item move for midpoint logic
      // If draggedItemId is provided, use it directly (most reliable)
      // Otherwise, try to detect which items moved
      const detectItemMove = (() => {
        if (orderedShotImageEntryIds.length !== currentOrder.length) return false;
        
        // If we know the dragged item, use that directly
        if (draggedItemId) {
          const oldIndex = currentOrder.indexOf(draggedItemId);
          const newIndex = orderedShotImageEntryIds.indexOf(draggedItemId);
          
          if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
            return false; // Item not found or didn't move
          }
          
          return {
            movedItemIds: [draggedItemId],
            newStartIndex: newIndex,
            oldStartIndex: oldIndex,
          };
        }
        
        // Fallback: Find all items that changed position (for multi-drag)
        const movedItemIds: string[] = [];
        const movedIndices: Array<{ oldIndex: number; newIndex: number }> = [];
        
        for (let i = 0; i < orderedShotImageEntryIds.length; i++) {
          if (orderedShotImageEntryIds[i] !== currentOrder[i]) {
            const oldIndex = currentOrder.indexOf(orderedShotImageEntryIds[i]);
            if (oldIndex !== -1) {
              movedItemIds.push(orderedShotImageEntryIds[i]);
              movedIndices.push({ oldIndex, newIndex: i });
            }
          }
        }
        
        if (movedItemIds.length === 0) return false;
        
        // Check if moved items form a contiguous block in the new order
        const newIndices = movedIndices.map(m => m.newIndex).sort((a, b) => a - b);
        const isContiguous = newIndices.every((idx, i) => 
          i === 0 || idx === newIndices[i - 1] + 1
        );
        
        if (!isContiguous) return false; // Not a simple block move
        
        return {
          movedItemIds,
          newStartIndex: Math.min(...newIndices),
          oldStartIndex: Math.min(...movedIndices.map(m => m.oldIndex)),
        };
      })();
      
      // NEW: Use midpoint logic for contiguous block moves (single or multi)
      // 🔧 FIX: Use parentHookRef to access latest parentHook (avoids stale closure)
      const moveToMidpoint = detectItemMove && parentHookRef.current?.moveItemsToMidpoint;
      if (detectItemMove && moveToMidpoint) {

        // Build the new order array for neighbor calculation
        const newOrderItems = orderedShotImageEntryIds.map(id => {
          // img.id is shot_generations.id - unique per entry
          const img = currentImages.find(i => i.id === id);
          return {
            id,
            timeline_frame: img?.timeline_frame ?? null
          };
        });

        await moveToMidpoint(
          detectItemMove.movedItemIds,
          detectItemMove.newStartIndex,
          newOrderItems
        );
        
        return;
      }
      
      // Safety check: If orderedIds has more items than currentImages, data is out of sync
      // This can happen when an image was just added but positions haven't reloaded yet
      if (orderedShotImageEntryIds.length !== currentImages.length) {
        console.error('[useEnhancedShotImageReorder] Data sync issue - array length mismatch:', {
          orderedIdsLength: orderedShotImageEntryIds.length,
          currentImagesLength: currentImages.length,
          orderedIds: orderedShotImageEntryIds.map(id => id.substring(0, 8)),
          currentIds: currentOrder.map(id => id.substring(0, 8))
        });
        
        // Check if any IDs in orderedIds are missing from currentImages
        const missingIds = orderedShotImageEntryIds.filter(id => !currentOrder.includes(id));
        if (missingIds.length > 0) {
          console.error('[useEnhancedShotImageReorder] Missing IDs detected - aborting reorder:', {
            missingIds: missingIds.map(id => id.substring(0, 8)),
            note: 'This can happen when reordering immediately after adding an image. Try again in a moment.'
          });
          toast.error('Please wait a moment and try again');
          return;
        }
      }
      
      
      // Find what actually changed between current and desired order
      const changes: Array<{
        oldPos: number;
        newPos: number;
        id: string; // shot_generations.id
        generationId: string;
        currentTimelineFrame: number;
        targetTimelineFrame: number;
      }> = [];

      // For each item in the desired order, check if its position changed
      // orderedShotImageEntryIds contains shot_generations.id values (unique per entry)
      for (let newPos = 0; newPos < orderedShotImageEntryIds.length; newPos++) {
        const id = orderedShotImageEntryIds[newPos]; // shot_generations.id
        const oldPos = currentOrder.indexOf(id);
        
        if (oldPos !== -1 && oldPos !== newPos) {
          // This item moved - find its current and target timeline_frame values
          const currentImg = currentImages[oldPos];
          const targetImg = currentImages[newPos];
          
          // Safety check: Ensure both images exist AND have id field (handles race conditions from just-added images)
          if (!currentImg || !targetImg || !currentImg.id || !targetImg.id) {
            console.error('[useEnhancedShotImageReorder] Skipping change - missing image data or id:', {
              id: id.substring(0, 8), // shot_generations.id
              oldPos,
              newPos,
              hasCurrentImg: !!currentImg,
              hasTargetImg: !!targetImg,
              currentImgHasId: currentImg ? !!currentImg.id : false,
              targetImgHasId: targetImg ? !!targetImg.id : false,
              currentImagesLength: currentImages.length,
              orderedIdsLength: orderedShotImageEntryIds.length,
              currentImgData: currentImg ? {
                id: currentImg.id?.substring(0, 8) || 'MISSING', // shot_generations.id
                generation_id: currentImg.generation_id?.substring(0, 8),
                timeline_frame: currentImg.timeline_frame
              } : 'null',
              targetImgData: targetImg ? {
                id: targetImg.id?.substring(0, 8) || 'MISSING', // shot_generations.id
                generation_id: targetImg.generation_id?.substring(0, 8),
                timeline_frame: targetImg.timeline_frame
              } : 'null'
            });
            continue;
          }
          
          // Find the shot_generation data to get timeline_frame values
          const currentShotGen = shotGenerations.find(shotGen => shotGen.generation_id === currentImg.id);
          const targetShotGen = shotGenerations.find(shotGen => shotGen.generation_id === targetImg.id);
          
          if (currentShotGen && targetShotGen) {
            changes.push({
              oldPos,
              newPos,
              id, // shot_generations.id
              generationId: getGenerationId(currentImg),
              currentTimelineFrame: currentShotGen.timeline_frame || 0,
              targetTimelineFrame: targetShotGen.timeline_frame || 0
            });
          }
        }
      }

      if (changes.length === 0) {
        return;
      }

      // Build sequential swaps to transform current order into desired order
      // This handles any permutation (simple swaps, complex chains, duplicate generation_ids)
      
      // Create working arrays with shot_generation IDs (the unique identifiers we need for swaps)
      // img.id is shot_generations.id - unique per entry
      const currentOrderIds = currentImages.map(img => img.id);
      const desiredOrderIds = [...orderedShotImageEntryIds]; // Copy to avoid mutation
      
      // Use pure utility function to analyze the reorder operation
      let reorderAnalysis;
      try {
        reorderAnalysis = analyzeReorderOperation(currentOrderIds, desiredOrderIds);
        validateReorderAnalysis(reorderAnalysis, desiredOrderIds);
      } catch (error) {
        console.error('[BatchModeReorderFlow] [ANALYSIS_ERROR] ❌ Failed to analyze reorder operation:', error);
        throw error;
      }
      
      const { swapSequence, noChangesNeeded } = reorderAnalysis;
      
      // Execute the swap sequence
      if (!noChangesNeeded && swapSequence.length > 0) {
        
        for (let i = 0; i < swapSequence.length; i++) {
          const swap = swapSequence[i];
          
          await exchangePositionsNoReload(swap.shotGenIdA, swap.shotGenIdB);
        }
        
        await loadPositions({ reason: 'reorder' });
      }

      // Reordering completed successfully - no toast needed for smooth UX

    } catch (error) {
      handleError(error, { context: 'useEnhancedShotImageReorder', toastTitle: 'Failed to reorder items' });
      throw error;
    }
  }, [shotId, getImagesForMode, shotGenerations, exchangePositionsNoReload, loadPositions]);

  // Handle item deletion
  // id parameter is shot_generations.id (unique per entry)
  const handleDelete = useCallback(async (id: string) => {
    if (!shotId) {
      throw new Error('No shot ID provided for deletion');
    }
    
    try {
      // Find the shot generation record by its ID
      const targetItem = shotGenerations.find(shotGen => shotGen.id === id);
      if (!targetItem) {
        throw new Error('Item not found for deletion');
      }

      // Pass the shot_generations.id to delete only this specific record
      await deleteItem(id);
      
    } catch (error) {
      handleError(error, { context: 'useEnhancedShotImageReorder', toastTitle: 'Failed to delete item' });
      throw error;
    }
  }, [shotId, shotGenerations, deleteItem]);

  return {
    handleReorder,
    handleDelete,
    isLoading,
    // Provide batch-mode sorted images
    getBatchImages: () => getImagesForMode('batch')
  };
};
