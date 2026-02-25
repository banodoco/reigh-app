import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useIsMobile, useIsTablet } from '@/shared/hooks/mobile';

type PaneLockKey = 'shots' | 'tasks' | 'gens';

interface PaneLocksState {
  shots: boolean;
  tasks: boolean;
  gens: boolean;
}

const UNLOCKED_PANES: PaneLocksState = {
  shots: false,
  tasks: false,
  gens: false,
};

export function usePaneLockPolicyState() {
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isSmallMobile = isMobile && !isTablet;

  const { value: paneLocks, update: savePaneLocks, isLoading } = useUserUIState('paneLocks', UNLOCKED_PANES);
  const [locks, setLocks] = useState(paneLocks);

  const [isGenerationsPaneOpenState, setIsGenerationsPaneOpenState] = useState(false);
  const [isTasksPaneOpenState, setIsTasksPaneOpenState] = useState(false);

  useEffect(() => {
    if (isSmallMobile) {
      setLocks(UNLOCKED_PANES);
      return;
    }

    if (!isLoading) {
      let newLocks = paneLocks;
      if (isTablet) {
        const activeLocks = Object.entries(paneLocks).filter(([_, locked]) => locked);
        if (activeLocks.length > 1) {
          const firstLocked = activeLocks[0][0] as PaneLockKey;
          newLocks = {
            shots: firstLocked === 'shots',
            tasks: firstLocked === 'tasks',
            gens: firstLocked === 'gens',
          };
        }
      }
      setLocks(newLocks);
      if (newLocks.tasks) {
        setIsTasksPaneOpenState(true);
      }
    }
  }, [isLoading, paneLocks, isSmallMobile, isTablet]);

  const createPaneLockSetter = useCallback(
    (lockKey: PaneLockKey) => (isLocked: boolean) => {
      setLocks((prev) => {
        if (prev[lockKey] === isLocked) return prev;
        const exclusiveLock = (isMobile || isTablet) && isLocked;
        return exclusiveLock
          ? { ...UNLOCKED_PANES, [lockKey]: isLocked }
          : { ...prev, [lockKey]: isLocked };
      });

      if (!isSmallMobile) {
        const exclusiveLock = (isMobile || isTablet) && isLocked;
        savePaneLocks(
          exclusiveLock
            ? { ...UNLOCKED_PANES, [lockKey]: isLocked }
            : { [lockKey]: isLocked },
        );
      }

      if (lockKey === 'tasks' && isLocked) {
        setIsTasksPaneOpenState(true);
      }
    },
    [isMobile, isTablet, isSmallMobile, savePaneLocks],
  );

  const setIsGenerationsPaneLocked = useMemo(() => createPaneLockSetter('gens'), [createPaneLockSetter]);
  const setIsShotsPaneLocked = useMemo(() => createPaneLockSetter('shots'), [createPaneLockSetter]);
  const setIsTasksPaneLocked = useMemo(() => createPaneLockSetter('tasks'), [createPaneLockSetter]);

  const setIsGenerationsPaneOpen = useCallback((isOpen: boolean) => {
    setIsGenerationsPaneOpenState(isOpen);
  }, []);

  const setIsTasksPaneOpen = useCallback((isOpen: boolean) => {
    if (!isSmallMobile) {
      setIsTasksPaneOpenState(isOpen);
    }
  }, [isSmallMobile]);

  const resetAllPaneLocks = useCallback(() => {
    setLocks(UNLOCKED_PANES);
    savePaneLocks(UNLOCKED_PANES);
  }, [savePaneLocks]);

  return {
    locks,
    isGenerationsPaneOpenState,
    isTasksPaneOpenState,
    setIsGenerationsPaneLocked,
    setIsShotsPaneLocked,
    setIsTasksPaneLocked,
    setIsGenerationsPaneOpen,
    setIsTasksPaneOpen,
    resetAllPaneLocks,
  };
}
