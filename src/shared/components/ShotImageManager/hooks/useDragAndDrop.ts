import { useState, useCallback } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import {
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { GenerationRow } from '@/types/shots';
import { calculateMultiDragOrder } from '../utils/reorder-utils';

interface UseDragAndDropProps {
  images: GenerationRow[];
  selectedIds: string[];
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  isMobile: boolean;
  setSelectedIds: (ids: string[]) => void;
  setLastSelectedIndex: (index: number | null) => void;
  setOptimisticOrder: (images: GenerationRow[]) => void;
  setIsOptimisticUpdate: (isUpdate: boolean) => void;
  setReconciliationId: (fn: (prev: number) => number) => void;
  /** Callback to notify parent of drag state changes - used to suppress query refetches during drag */
  onDragStateChange?: (isDragging: boolean) => void;
}

export function useDragAndDrop({
  images,
  selectedIds,
  onImageReorder,
  isMobile,
  setSelectedIds,
  setLastSelectedIndex,
  setOptimisticOrder,
  setIsOptimisticUpdate,
  setReconciliationId,
  onDragStateChange
}: UseDragAndDropProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: isMobile
        ? { distance: 99999 }
        : { delay: 150, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  
  const handleDragStart = useCallback((event: DragStartEvent) => {
    
    const { active } = event;
    const draggedItemId = active.id as string;
    
    // img.id is shot_generations.id - unique per entry
    const draggedItem = images.find(img => img.id === draggedItemId);
    
    setActiveId(draggedItemId);

    // Notify parent that drag has started - used to suppress query refetches
    onDragStateChange?.(true);

    const activatorEvent = event.activatorEvent as MouseEvent | PointerEvent | undefined;
    const isModifierPressed = activatorEvent?.metaKey || activatorEvent?.ctrlKey;
    
    if (!isModifierPressed && !selectedIds.includes(active.id as string)) {
      setSelectedIds([]);
      setLastSelectedIndex(null);
    }
  }, [selectedIds, images, setSelectedIds, setLastSelectedIndex]);
  
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    
    const { active, over } = event;
    const draggedItemId = active.id as string;
    const targetItemId = over?.id as string;
    
    setActiveId(null);

    // Notify parent that drag has ended - re-enable query refetches
    onDragStateChange?.(false);

    if (!over || active.id === over.id) {
      return;
    }
    
    if (!images || images.length === 0) {
      return;
    }
    
    // Safety check: Ensure all images have id
    const hasMissingIds = images.some(img => !img.id);
    if (hasMissingIds) {
      const missingCount = images.filter(img => !img.id).length;
      const message = images.length > 500
        ? `Loading metadata for ${images.length} images... this may take a moment.`
        : 'Loading image metadata... please wait a moment and try again.';
      toast.error(message);
      // Clear selection
      setSelectedIds([]);
      setLastSelectedIndex(null);
      return;
    }
    
    const activeIsSelected = selectedIds.includes(active.id as string);
    
    if (!activeIsSelected || selectedIds.length <= 1) {
      // img.id is shot_generations.id - unique per entry
      const oldIndex = images.findIndex((img) => img.id === active.id);
      const newIndex = images.findIndex((img) => img.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        const newOrder = arrayMove(images, oldIndex, newIndex);
        
        setReconciliationId(prev => prev + 1);
        setIsOptimisticUpdate(true);
        setOptimisticOrder(newOrder);
        
        // img.id is shot_generations.id - unique per entry
        const orderedIds = newOrder.map((img) => img.id);
        // draggedItemId is already defined at function scope (line 97)
        onImageReorder(orderedIds, draggedItemId);
      }
      setSelectedIds([]);
      setLastSelectedIndex(null);
      return;
    }
    
    // Multi-drag logic
    
    // img.id is shot_generations.id - unique per entry
    const overIndex = images.findIndex((img) => img.id === over.id);
    const activeIndex = images.findIndex((img) => img.id === active.id);
    
    const newItems = calculateMultiDragOrder(
      images,
      selectedIds,
      activeIndex,
      overIndex,
      active.id as string,
      over.id as string
    );
    
    // img.id is shot_generations.id - unique per entry
    const currentOrder = images.map(img => img.id).join(',');
    const newOrder = newItems.map(img => img.id).join(',');
    
    if (currentOrder === newOrder) {
      setSelectedIds([]);
      setLastSelectedIndex(null);
      return;
    }
    
    setReconciliationId(prev => prev + 1);
    setIsOptimisticUpdate(true);
    setOptimisticOrder(newItems);
    
    const reorderedIds = newItems.map((img) => img.id);
    // draggedItemId is already defined at function scope (line 97)
    // For multi-drag, we pass undefined for draggedItemId since multiple items moved
    // The reorder handler will fall back to detecting the moved items
    onImageReorder(reorderedIds, selectedIds.length > 1 ? undefined : draggedItemId);
    setSelectedIds([]);
    setLastSelectedIndex(null);
  }, [selectedIds, images, onImageReorder, setSelectedIds, setLastSelectedIndex, setOptimisticOrder, setIsOptimisticUpdate, setReconciliationId]);
  
  // img.id is shot_generations.id - unique per entry
  const activeImage = activeId ? images.find((img) => img.id === activeId) : null;
  
  return {
    activeId,
    sensors,
    handleDragStart,
    handleDragEnd,
    activeImage
  };
}

