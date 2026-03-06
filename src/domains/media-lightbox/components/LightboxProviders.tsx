import React from 'react';
import { LightboxStateProvider, type LightboxStateValue } from '../contexts/LightboxStateContext';

interface LightboxProvidersProps {
  stateValue: LightboxStateValue;
  children: React.ReactNode;
}

export function LightboxProviders({
  stateValue,
  children,
}: LightboxProvidersProps) {
  return (
    <LightboxStateProvider value={stateValue}>
      {children}
    </LightboxStateProvider>
  );
}
