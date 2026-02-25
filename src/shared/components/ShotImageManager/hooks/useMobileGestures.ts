import { useCallback, useRef } from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { DOUBLE_TAP_THRESHOLD } from '../constants';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface UseMobileGesturesProps {
  currentImages: GenerationRow[];
  mobileSelectedIds: string[];
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  setMobileSelectedIds: (fn: (prev: string[]) => string[]) => void;
  setLightboxIndex: (index: number) => void;
}

export function useMobileGestures({
  currentImages,
  mobileSelectedIds,
  onImageReorder,
  setMobileSelectedIds,
  setLightboxIndex
}: UseMobileGesturesProps) {
  const lastTouchTimeRef = useRef<number>(0);
  const lastTappedImageIdRef = useRef<string | null>(null);
  
  // Mobile double-tap detection
  const handleMobileTap = useCallback((id: string, index: number) => {
    // Safety check
    if (!currentImages || currentImages.length === 0 || index >= currentImages.length) {
      return;
    }
    
    const currentTime = Date.now();
    const timeDiff = currentTime - lastTouchTimeRef.current;
    const isSameImage = lastTappedImageIdRef.current === id;
    
    // On any tap, immediately toggle the selection state
    setMobileSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(selectedId => selectedId !== id)
        : [...prev, id]
    );
    
    // If this tap is a double-tap, also open the lightbox
    if (timeDiff < DOUBLE_TAP_THRESHOLD && timeDiff > 10 && isSameImage) {
      const image = currentImages[index];
      if (image?.imageUrl) {
        setLightboxIndex(index);
      }
      // Reset tap tracking to prevent a third tap from also triggering
      lastTouchTimeRef.current = 0;
      lastTappedImageIdRef.current = null;
    } else {
      // It's a single tap, so just update the tracking refs
      lastTouchTimeRef.current = currentTime;
      lastTappedImageIdRef.current = id;
    }
  }, [currentImages, setMobileSelectedIds, setLightboxIndex]);
  
  // Mobile move-here functionality
  const handleMobileMoveHere = useCallback(async (targetIndex: number) => {
    if (mobileSelectedIds.length === 0) {
      return;
    }
    
    try {
      // Get the selected images and their current indices
      // img.id is shot_generations.id - unique per entry
      const selectedItems = mobileSelectedIds.map(id => {
        const image = currentImages.find(img => img.id === id);
        const index = currentImages.findIndex(img => img.id === id);
        return { id, image, currentIndex: index };
      }).filter(item => item.image && item.currentIndex !== -1);
      
      if (selectedItems.length === 0) {
        return;
      }
      
      // Sort by current index to maintain relative order
      selectedItems.sort((a, b) => a.currentIndex - b.currentIndex);
      
      // Create new order by moving selected items to target position
      const newOrder = [...currentImages];
      
      // Remove selected items from their current positions (in reverse order to maintain indices)
      selectedItems.reverse().forEach(item => {
        newOrder.splice(item.currentIndex, 1);
      });
      
      // Insert selected items at target position (maintaining their relative order)
      selectedItems.reverse().forEach((item, i) => {
        newOrder.splice(targetIndex + i, 0, item.image!);
      });
      
      // Create ordered IDs array for the unified system
      // img.id is shot_generations.id - unique per entry
      const orderedIds = newOrder.map(img => img.id);
      
      // For single item moves, pass the dragged item ID for midpoint insertion
      const draggedItemId = selectedItems.length === 1 ? selectedItems[0].id : undefined;
      
      // Use the unified position system
      await onImageReorder(orderedIds, draggedItemId);
      
      // Clear selection after successful reorder
      setMobileSelectedIds(() => []);
      
    } catch (error) {
      normalizeAndPresentError(error, { context: 'useMobileGestures', showToast: false });
    }
  }, [mobileSelectedIds, currentImages, onImageReorder, setMobileSelectedIds]);
  
  return {
    handleMobileTap,
    handleMobileMoveHere
  };
}
