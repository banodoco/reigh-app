import { useState, useEffect, useRef } from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { OPTIMISTIC_UPDATE_TIMEOUT } from '../constants';

interface UseOptimisticOrderProps {
  images: GenerationRow[];
}

export function useOptimisticOrder({ images }: UseOptimisticOrderProps) {
  const [optimisticOrder, setOptimisticOrder] = useState<GenerationRow[]>(images);
  const [isOptimisticUpdate, setIsOptimisticUpdate] = useState(false);
  const [reconciliationId, setReconciliationId] = useState(0);
  const reconciliationTimeoutRef = useRef<NodeJS.Timeout>();
  const optimisticStartTimeRef = useRef<number>(0);

  // Enhanced reconciliation with debouncing, tracking IDs, and timeout-based recovery
  useEffect(() => {
    
    // Clear any pending reconciliation timeout
    if (reconciliationTimeoutRef.current) {
      clearTimeout(reconciliationTimeoutRef.current);
    }
    
    // If we're in the middle of an optimistic update, use debounced reconciliation
    if (isOptimisticUpdate) {
      
      const currentReconciliationId = reconciliationId;
      
      // Debounce reconciliation checks to prevent race conditions
      reconciliationTimeoutRef.current = setTimeout(() => {
        // Check if this reconciliation is still current
        if (currentReconciliationId !== reconciliationId) {
          return;
        }
        
        // Check if parent props now match our optimistic order
        // img.id is shot_generations.id - unique per entry
        const currentOrder = optimisticOrder.map(img => img.id).join(',');
        const parentOrder = images.map(img => img.id).join(',');
        
        if (currentOrder === parentOrder) {
          setIsOptimisticUpdate(false);
          if (optimisticOrder !== images) {
            setOptimisticOrder(images);
          }
        } else {
          
          // Safety check: if optimistic update has been active too long, force reconciliation
          if (Date.now() - optimisticStartTimeRef.current > OPTIMISTIC_UPDATE_TIMEOUT) {
            setIsOptimisticUpdate(false);
            setOptimisticOrder(images);
          }
        }
      }, 100); // 100ms debounce
    } else {
      if (optimisticOrder !== images) {
        setOptimisticOrder(images);
      }
    }
  }, [images, isOptimisticUpdate, reconciliationId, optimisticOrder]);
  
  // If not in an optimistic update, optimisticOrder should always reflect the parent's images prop.
  // When an optimistic update is finished, this effect will re-sync with the parent.
  useEffect(() => {
    if (!isOptimisticUpdate) {
      setOptimisticOrder(images);
    }
  }, [images, isOptimisticUpdate]);
  
  // Cleanup reconciliation timeout on unmount
  useEffect(() => {
    return () => {
      if (reconciliationTimeoutRef.current) {
        clearTimeout(reconciliationTimeoutRef.current);
      }
    };
  }, []);
  
  const setIsOptimisticUpdateTracked = (value: boolean | ((prev: boolean) => boolean)) => {
    setIsOptimisticUpdate((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      if (next && !prev) {
        optimisticStartTimeRef.current = Date.now();
      }
      return next;
    });
  };

  return {
    optimisticOrder,
    setOptimisticOrder,
    isOptimisticUpdate,
    setIsOptimisticUpdate: setIsOptimisticUpdateTracked,
    reconciliationId,
    setReconciliationId
  };
}

