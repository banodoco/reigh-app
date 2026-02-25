import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ShotAdditionSelectionContextValue {
  selectedShotId: string | null;
  selectShotForAddition: (shotId: string) => void;
  clearSelectedShotForAddition: () => void;
}

const ShotAdditionSelectionContext =
  createContext<ShotAdditionSelectionContextValue | null>(null);

interface ShotAdditionSelectionProviderProps {
  children: React.ReactNode;
}

export function ShotAdditionSelectionProvider({ children }: ShotAdditionSelectionProviderProps) {
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);

  const selectShotForAddition = useCallback((shotId: string) => {
    setSelectedShotId(shotId);
  }, []);

  const clearSelectedShotForAddition = useCallback(() => {
    setSelectedShotId(null);
  }, []);

  const value = useMemo<ShotAdditionSelectionContextValue>(() => ({
    selectedShotId,
    selectShotForAddition,
    clearSelectedShotForAddition,
  }), [selectedShotId, selectShotForAddition, clearSelectedShotForAddition]);

  return (
    <ShotAdditionSelectionContext.Provider value={value}>
      {children}
    </ShotAdditionSelectionContext.Provider>
  );
}

export function useShotAdditionSelectionOptional(): ShotAdditionSelectionContextValue | null {
  return useContext(ShotAdditionSelectionContext);
}

export function useShotAdditionSelection(): ShotAdditionSelectionContextValue {
  const context = useShotAdditionSelectionOptional();
  if (!context) {
    throw new Error('useShotAdditionSelection must be used within ShotAdditionSelectionProvider');
  }
  return context;
}
