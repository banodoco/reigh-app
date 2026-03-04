import React, { createContext, useContext } from 'react';
import type { ShotSettingsContextValue } from './ShotSettingsContext.types';

const ShotSettingsContext = createContext<ShotSettingsContextValue | null>(null);

export function useShotSettingsContext(): ShotSettingsContextValue {
  const ctx = useContext(ShotSettingsContext);
  if (!ctx) {
    throw new Error('useShotSettingsContext must be used within ShotSettingsProvider');
  }
  return ctx;
}

export const ShotSettingsProvider: React.FC<{
  value: ShotSettingsContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return (
    <ShotSettingsContext.Provider value={value}>
      {children}
    </ShotSettingsContext.Provider>
  );
};
