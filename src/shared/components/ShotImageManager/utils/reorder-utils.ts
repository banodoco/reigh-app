import { GenerationRow } from '@/domains/generation/types';

/**
 * Calculate new order for multi-drag operation
 */
export const calculateMultiDragOrder = (
  currentImages: GenerationRow[],
  selectedIds: string[],
  activeIndex: number,
  overIndex: number,
  _activeId: string,
  overId: string
): GenerationRow[] => {
  // img.id is shot_generations.id - unique per entry
  const selectedItems = currentImages.filter((img) => selectedIds.includes(img.id));
  const remainingItems = currentImages.filter((img) => !selectedIds.includes(img.id));

  // If dropping onto a selected item, we need to determine the correct insertion point
  let targetIndex: number;
  let newItems: GenerationRow[];
  
  if (selectedIds.includes(overId)) {
    // Dropping onto a selected item - use the position relative to non-selected items
    const selectedItemIndices = selectedItems.map(item => 
      currentImages.findIndex(img => img.id === item.id)
    ).sort((a, b) => a - b);
    
    const overIndexInSelected = selectedItemIndices.indexOf(overIndex);
    
    if (overIndexInSelected === 0) {
      // Dropping on first selected item - insert at beginning of group
      targetIndex = selectedItemIndices[0];
    } else {
      // Dropping on other selected item - insert after the previous non-selected item
      const prevSelectedIndex = selectedItemIndices[overIndexInSelected - 1];
      const itemsBetween = currentImages.slice(prevSelectedIndex + 1, overIndex);
      const nonSelectedBetween = itemsBetween.filter(item => !selectedIds.includes(item.id));
      targetIndex = prevSelectedIndex + nonSelectedBetween.length + 1;
    }
    
    const overInRemainingIndex = remainingItems.findIndex((_, idx) => {
      const remainingItemIndex = currentImages.findIndex(img => 
        img.id === remainingItems[idx].id
      );
      return remainingItemIndex >= targetIndex;
    });
    
    if (overInRemainingIndex === -1) {
      // Insert at end
      newItems = [...remainingItems, ...selectedItems];
    } else {
      newItems = [
        ...remainingItems.slice(0, overInRemainingIndex),
        ...selectedItems,
        ...remainingItems.slice(overInRemainingIndex),
      ];
    }
  } else {
    // Dropping onto a non-selected item - use original logic
    const overInRemainingIndex = remainingItems.findIndex((img) => img.id === overId);

    if (activeIndex > overIndex) {
      // Dragging up
      newItems = [
        ...remainingItems.slice(0, overInRemainingIndex),
        ...selectedItems,
        ...remainingItems.slice(overInRemainingIndex),
      ];
    } else {
      // Dragging down
      newItems = [
        ...remainingItems.slice(0, overInRemainingIndex + 1),
        ...selectedItems,
        ...remainingItems.slice(overInRemainingIndex + 1),
      ];
    }
  }

  return newItems;
};
