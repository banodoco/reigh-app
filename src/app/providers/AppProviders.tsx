import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/shared/contexts/AuthContext';
import { AuthGate } from '@/shared/components/AuthGate';
import { UserSettingsProvider } from '@/shared/contexts/UserSettingsContext';
import { ProjectProvider } from '@/shared/contexts/ProjectContext';
import { RealtimeProvider } from '@/shared/providers/RealtimeProvider';
import { ShotsProvider } from '@/shared/contexts/ShotsContext';
import { GenerationTaskProvider } from '@/shared/contexts/GenerationTaskContext';
import { IncomingTasksProvider } from '@/shared/contexts/IncomingTasksContext';
import { PanesProvider } from '@/shared/contexts/PanesContext';
import { LastAffectedShotProvider } from '@/shared/contexts/LastAffectedShotContext';
import { CurrentShotProvider } from '@/shared/contexts/CurrentShotContext';
import { ToolPageHeaderProvider } from '@/shared/contexts/ToolPageHeaderContext';
import { TaskTypeConfigInitializer } from '@/shared/components/TaskTypeConfigInitializer';
import { queryClient } from '@/app/providers/queryClient';

interface AppProvidersProps {
  children: React.ReactNode;
}

type TreeProvider = React.ComponentType<{ children: React.ReactNode }>;

function composeProviders(providers: TreeProvider[]): TreeProvider {
  return function ProviderTree({ children }: { children: React.ReactNode }) {
    return providers.reduceRight(
      (acc, Provider) => <Provider>{acc}</Provider>,
      children
    );
  };
}

const AppProviderTree = composeProviders([
  AuthProvider,
  AuthGate,
  UserSettingsProvider,
  ProjectProvider,
  RealtimeProvider,
  ShotsProvider,
  GenerationTaskProvider,
  IncomingTasksProvider,
  PanesProvider,
  LastAffectedShotProvider,
  CurrentShotProvider,
  ToolPageHeaderProvider,
]);

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <TaskTypeConfigInitializer />
      <AppProviderTree>{children}</AppProviderTree>
    </QueryClientProvider>
  );
}
