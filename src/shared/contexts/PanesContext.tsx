import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useIsMobile, useIsTablet } from '@/shared/hooks/use-mobile';
import { PANE_CONFIG } from '@/shared/config/panes';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandling/handleError';

interface PanesContextType {
  isGenerationsPaneLocked: boolean;
  setIsGenerationsPaneLocked: (isLocked: boolean) => void;
  isGenerationsPaneOpen: boolean;
  setIsGenerationsPaneOpen: (isOpen: boolean) => void;
  generationsPaneHeight: number;
  setGenerationsPaneHeight: (height: number) => void;

  isShotsPaneLocked: boolean;
  setIsShotsPaneLocked: (isLocked: boolean) => void;
  shotsPaneWidth: number;
  setShotsPaneWidth: (width: number) => void;

  isTasksPaneLocked: boolean;
  setIsTasksPaneLocked: (isLocked: boolean) => void;
  tasksPaneWidth: number;
  setTasksPaneWidth: (width: number) => void;

  // Active task tracking for highlighting
  activeTaskId: string | null;
  setActiveTaskId: (taskId: string | null) => void;

  // Programmatic tasks pane control (desktop only)
  isTasksPaneOpen: boolean;
  setIsTasksPaneOpen: (isOpen: boolean) => void;

  // Reset all pane locks (used by ProductTour)
  resetAllPaneLocks: () => void;
}

const PanesContext = createContext<PanesContextType | undefined>(undefined);

export const PanesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  
  // On tablets, allow locking but only one pane at a time
  // On phones (mobile but not tablet), no locking allowed
  const isSmallMobile = isMobile && !isTablet;
  
  // Load pane locks from user settings (desktop and tablet)
  const { value: paneLocks, update: savePaneLocks, isLoading } = useUserUIState('paneLocks', {
    shots: false,
    tasks: false,
    gens: false,
  });

  // Local state for lock status (source of truth for UI)
  const [locks, setLocks] = useState(paneLocks);

  // Pane open states (not persisted, runtime only)
  const [isGenerationsPaneOpenState, setIsGenerationsPaneOpenState] = useState(false);
  const [isTasksPaneOpenState, setIsTasksPaneOpenState] = useState(false);

  // Pane dimensions (not persisted)
  const [generationsPaneHeight, setGenerationsPaneHeightState] = useState<number>(PANE_CONFIG.dimensions.DEFAULT_HEIGHT);
  const [shotsPaneWidth, setShotsPaneWidthState] = useState<number>(PANE_CONFIG.dimensions.DEFAULT_WIDTH);
  const [tasksPaneWidth, setTasksPaneWidthState] = useState<number>(PANE_CONFIG.dimensions.DEFAULT_WIDTH);
  
  // Active task tracking (not persisted)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Hydrate local state once when settings load (desktop and tablet)
  useEffect(() => {
    if (isSmallMobile) {
      // On small mobile (phones), always start with unlocked state
      setLocks({
        shots: false,
        tasks: false,
        gens: false,
      });
      return;
    }

    if (!isLoading) {
      // Hydrating pane locks from server (desktop and tablet)
      // On tablets, only keep one lock if multiple are saved
      let newLocks = paneLocks;
      if (isTablet) {
        const activeLocks = Object.entries(paneLocks).filter(([_, locked]) => locked);
        if (activeLocks.length > 1) {
          // Keep only the first locked pane on tablets
          const firstLocked = activeLocks[0][0] as 'shots' | 'tasks' | 'gens';
          newLocks = {
            shots: firstLocked === 'shots',
            tasks: firstLocked === 'tasks',
            gens: firstLocked === 'gens',
          };
        }
      }
      setLocks(newLocks);

      // IMPORTANT: Sync isTasksPaneOpen with isTasksPaneLocked on hydration
      // This ensures lightboxes (which read isTasksPaneOpen from context) correctly
      // account for a locked pane even after page refresh
      if (newLocks.tasks) {
        setIsTasksPaneOpenState(true);
      }
    }
  }, [isLoading, paneLocks, isSmallMobile, isTablet]);


  // Factory for pane lock setters — each pane follows the same logic:
  // 1. On mobile/tablet + locking: unlock all OTHER panes (exclusive locking)
  // 2. On small phone: skip persistence to DB
  // 3. On desktop: standard toggle
  const createPaneLockSetter = useCallback(
    (lockKey: 'gens' | 'shots' | 'tasks') => (isLocked: boolean) => {
      setLocks(prev => {
        if (prev[lockKey] === isLocked) return prev;

        // On mobile/tablets, unlock other panes when locking this one (only one pane can be locked at a time)
        const exclusiveLock = (isMobile || isTablet) && isLocked;
        return exclusiveLock
          ? { shots: false, tasks: false, gens: false, [lockKey]: isLocked }
          : { ...prev, [lockKey]: isLocked };
      });

      // Save to database (desktop and tablet only, not small phones)
      // Kept outside setLocks updater to avoid side effects in state updater functions
      if (!isSmallMobile) {
        const exclusiveLock = (isMobile || isTablet) && isLocked;
        savePaneLocks(exclusiveLock
          ? { shots: false, tasks: false, gens: false, [lockKey]: isLocked }
          : { [lockKey]: isLocked });
      }

      // IMPORTANT: Sync isTasksPaneOpen with isTasksPaneLocked
      // This ensures lightboxes correctly account for locked pane state
      if (lockKey === 'tasks' && isLocked) {
        setIsTasksPaneOpenState(true);
      }
    },
    [savePaneLocks, isSmallMobile, isMobile, isTablet]
  );

  const setIsGenerationsPaneLocked = useMemo(() => createPaneLockSetter('gens'), [createPaneLockSetter]);
  const setIsShotsPaneLocked = useMemo(() => createPaneLockSetter('shots'), [createPaneLockSetter]);
  const setIsTasksPaneLocked = useMemo(() => createPaneLockSetter('tasks'), [createPaneLockSetter]);

  // Open state setters
  const setIsGenerationsPaneOpen = useCallback((isOpen: boolean) => {
    setIsGenerationsPaneOpenState(isOpen);
  }, []);
  
  const setIsTasksPaneOpen = useCallback((isOpen: boolean) => {
    // Works on desktop and tablets - only small phones use hover/tap behavior exclusively
    if (!isSmallMobile) {
      setIsTasksPaneOpenState(isOpen);
    }
  }, [isSmallMobile]);

  // Reset all pane locks immediately (used by ProductTour)
  // This updates local state, useUserUIState value, and database without debounce
  const resetAllPaneLocks = useCallback(async () => {
    const unlockedState = { shots: false, tasks: false, gens: false };

    // Update local locks state immediately
    setLocks(unlockedState);

    // Update the useUserUIState local value (prevents sync effect from restoring old value)
    savePaneLocks(unlockedState);

    // Also save to database immediately (no debounce) for reliability
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await updateToolSettingsSupabase({
          scope: 'user',
          id: user.id,
          toolId: 'ui',
          patch: { paneLocks: unlockedState },
        }, undefined, 'immediate');
      }
    } catch (error) {
      handleError(error, { context: 'PanesContext', showToast: false });
    }
  }, [savePaneLocks]);

  // Dimension setters
  const setGenerationsPaneHeight = useCallback((height: number) => {
    setGenerationsPaneHeightState(height);
  }, []);

  const setShotsPaneWidth = useCallback((width: number) => {
    setShotsPaneWidthState(width);
  }, []);

  const setTasksPaneWidth = useCallback((width: number) => {
    setTasksPaneWidthState(width);
  }, []);

  const value = useMemo(
    () => ({
      // Return actual lock state for all device types (mobile locking is now supported)
      isGenerationsPaneLocked: locks.gens,
      setIsGenerationsPaneLocked,
      isGenerationsPaneOpen: isGenerationsPaneOpenState,
      setIsGenerationsPaneOpen,
      generationsPaneHeight,
      setGenerationsPaneHeight,
      isShotsPaneLocked: locks.shots,
      setIsShotsPaneLocked,
      shotsPaneWidth,
      setShotsPaneWidth,
      isTasksPaneLocked: locks.tasks,
      setIsTasksPaneLocked,
      tasksPaneWidth,
      setTasksPaneWidth,
      activeTaskId,
      setActiveTaskId,
      isTasksPaneOpen: isTasksPaneOpenState,
      setIsTasksPaneOpen,
      resetAllPaneLocks,
    }),
    [
      locks.gens,
      locks.shots,
      locks.tasks,
      setIsGenerationsPaneLocked,
      setIsShotsPaneLocked,
      setIsTasksPaneLocked,
      isGenerationsPaneOpenState,
      setIsGenerationsPaneOpen,
      generationsPaneHeight,
      setGenerationsPaneHeight,
      shotsPaneWidth,
      setShotsPaneWidth,
      tasksPaneWidth,
      setTasksPaneWidth,
      activeTaskId,
      setActiveTaskId,
      isTasksPaneOpenState,
      setIsTasksPaneOpen,
      resetAllPaneLocks,
    ]
  );

  return (
    <PanesContext.Provider value={value}>
      {children}
    </PanesContext.Provider>
  );
};

export const usePanes = () => {
  const context = useContext(PanesContext);
  if (context === undefined) {
    throw new Error('usePanes must be used within a PanesProvider');
  }
  return context;
}; 