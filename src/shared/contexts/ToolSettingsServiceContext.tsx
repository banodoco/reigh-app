import React, { createContext, useContext, useMemo } from 'react';
import {
  ToolSettingsService,
  createToolSettingsService,
} from '@/shared/lib/toolSettingsService';

const ToolSettingsServiceContext = createContext<ToolSettingsService | null>(null);

interface ToolSettingsServiceProviderProps {
  children: React.ReactNode;
  service?: ToolSettingsService;
}

export function ToolSettingsServiceProvider({
  children,
  service,
}: ToolSettingsServiceProviderProps) {
  const value = useMemo(
    () => service ?? createToolSettingsService(),
    [service],
  );

  return (
    <ToolSettingsServiceContext.Provider value={value}>
      {children}
    </ToolSettingsServiceContext.Provider>
  );
}

function useToolSettingsServiceOptional(): ToolSettingsService | null {
  return useContext(ToolSettingsServiceContext);
}

export function useToolSettingsService(): ToolSettingsService {
  const service = useToolSettingsServiceOptional();
  if (!service) {
    throw new Error('useToolSettingsService must be used within ToolSettingsServiceProvider');
  }
  return service;
}
