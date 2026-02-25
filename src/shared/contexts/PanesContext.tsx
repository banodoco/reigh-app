import React, { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { PANE_CONFIG } from '@/shared/config/panes';
import { usePaneLockPolicyState } from '@/shared/contexts/usePaneLockPolicyState';

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

type PaneLockPolicyContextType = Pick<
  PanesContextType,
  | 'isGenerationsPaneLocked'
  | 'setIsGenerationsPaneLocked'
  | 'isGenerationsPaneOpen'
  | 'setIsGenerationsPaneOpen'
  | 'isShotsPaneLocked'
  | 'setIsShotsPaneLocked'
  | 'isTasksPaneLocked'
  | 'setIsTasksPaneLocked'
  | 'isTasksPaneOpen'
  | 'setIsTasksPaneOpen'
  | 'resetAllPaneLocks'
>;

type PaneLayoutContextType = Pick<
  PanesContextType,
  | 'generationsPaneHeight'
  | 'setGenerationsPaneHeight'
  | 'shotsPaneWidth'
  | 'setShotsPaneWidth'
  | 'tasksPaneWidth'
  | 'setTasksPaneWidth'
>;

type PaneSelectionContextType = Pick<
  PanesContextType,
  | 'activeTaskId'
  | 'setActiveTaskId'
>;

const PaneLockPolicyContext = createContext<PaneLockPolicyContextType | undefined>(undefined);
const PaneLayoutContext = createContext<PaneLayoutContextType | undefined>(undefined);
const PaneSelectionContext = createContext<PaneSelectionContextType | undefined>(undefined);

export const PanesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const {
    locks,
    isGenerationsPaneOpenState,
    isTasksPaneOpenState,
    setIsGenerationsPaneLocked,
    setIsShotsPaneLocked,
    setIsTasksPaneLocked,
    setIsGenerationsPaneOpen,
    setIsTasksPaneOpen,
    resetAllPaneLocks,
  } = usePaneLockPolicyState();

  // Pane dimensions (not persisted)
  const [generationsPaneHeight, setGenerationsPaneHeightState] = useState<number>(PANE_CONFIG.dimensions.DEFAULT_HEIGHT);
  const [shotsPaneWidth, setShotsPaneWidthState] = useState<number>(PANE_CONFIG.dimensions.DEFAULT_WIDTH);
  const [tasksPaneWidth, setTasksPaneWidthState] = useState<number>(PANE_CONFIG.dimensions.DEFAULT_WIDTH);
  
  // Active task tracking (not persisted)
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

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

  const lockPolicyValue = useMemo(
    (): PaneLockPolicyContextType => ({
      isGenerationsPaneLocked: locks.gens,
      setIsGenerationsPaneLocked,
      isGenerationsPaneOpen: isGenerationsPaneOpenState,
      setIsGenerationsPaneOpen,
      isShotsPaneLocked: locks.shots,
      setIsShotsPaneLocked,
      isTasksPaneLocked: locks.tasks,
      setIsTasksPaneLocked,
      isTasksPaneOpen: isTasksPaneOpenState,
      setIsTasksPaneOpen,
      resetAllPaneLocks,
    }),
    [
      locks.gens,
      locks.shots,
      locks.tasks,
      setIsGenerationsPaneLocked,
      isGenerationsPaneOpenState,
      setIsGenerationsPaneOpen,
      setIsShotsPaneLocked,
      setIsTasksPaneLocked,
      isTasksPaneOpenState,
      setIsTasksPaneOpen,
      resetAllPaneLocks,
    ]
  );

  const layoutValue = useMemo(
    (): PaneLayoutContextType => ({
      generationsPaneHeight,
      setGenerationsPaneHeight,
      shotsPaneWidth,
      setShotsPaneWidth,
      tasksPaneWidth,
      setTasksPaneWidth,
    }),
    [
      generationsPaneHeight,
      setGenerationsPaneHeight,
      shotsPaneWidth,
      setShotsPaneWidth,
      tasksPaneWidth,
      setTasksPaneWidth,
    ]
  );

  const selectionValue = useMemo(
    (): PaneSelectionContextType => ({
      activeTaskId,
      setActiveTaskId,
    }),
    [
      activeTaskId,
      setActiveTaskId,
    ]
  );

  return (
    <PaneLockPolicyContext.Provider value={lockPolicyValue}>
      <PaneLayoutContext.Provider value={layoutValue}>
        <PaneSelectionContext.Provider value={selectionValue}>
          {children}
        </PaneSelectionContext.Provider>
      </PaneLayoutContext.Provider>
    </PaneLockPolicyContext.Provider>
  );
};

export const usePanes = () => {
  const lockPolicy = useContext(PaneLockPolicyContext);
  const layout = useContext(PaneLayoutContext);
  const selection = useContext(PaneSelectionContext);

  if (!lockPolicy || !layout || !selection) {
    throw new Error('usePanes must be used within a PanesProvider');
  }

  return {
    ...lockPolicy,
    ...layout,
    ...selection,
  };
};
