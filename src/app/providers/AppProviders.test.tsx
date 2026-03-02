import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppProviders } from './AppProviders';
import { queryClient } from './queryClient';

const queryClientProviderSpy = vi.fn();
const tooltipProviderSpy = vi.fn();

function wrapWithTestId(testId: string) {
  return ({ children }: { children: React.ReactNode }) => <div data-testid={testId}>{children}</div>;
}

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    QueryClientProvider: ({ client, children }: { client: unknown; children: React.ReactNode }) => {
      queryClientProviderSpy(client);
      return <div data-testid="query-client-provider">{children}</div>;
    },
  };
});

vi.mock('@/shared/components/ui/tooltip', () => ({
  TooltipProvider: ({ children, delayDuration }: { children: React.ReactNode; delayDuration?: number }) => {
    tooltipProviderSpy(delayDuration);
    return <div data-testid="tooltip-provider">{children}</div>;
  },
}));

vi.mock('@/shared/components/TaskTypeConfigInitializer', () => ({
  TaskTypeConfigInitializer: () => <div data-testid="task-type-config-initializer" />,
}));

vi.mock('@/shared/contexts/AuthContext', () => ({
  AuthProvider: wrapWithTestId('auth-provider'),
}));

vi.mock('@/shared/auth/components/AuthGate', () => ({
  AuthGate: wrapWithTestId('auth-gate'),
}));

vi.mock('@/shared/contexts/UserSettingsContext', () => ({
  UserSettingsProvider: wrapWithTestId('user-settings-provider'),
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  ProjectProvider: wrapWithTestId('project-provider'),
}));

vi.mock('@/shared/providers/RealtimeProvider', () => ({
  RealtimeProvider: wrapWithTestId('realtime-provider'),
}));

vi.mock('@/shared/contexts/ShotsContext', () => ({
  ShotsProvider: wrapWithTestId('shots-provider'),
}));

vi.mock('@/shared/contexts/GenerationTaskContext', () => ({
  GenerationTaskProvider: wrapWithTestId('generation-task-provider'),
}));

vi.mock('@/shared/contexts/IncomingTasksContext', () => ({
  IncomingTasksProvider: wrapWithTestId('incoming-tasks-provider'),
}));

vi.mock('@/shared/contexts/PanesContext', () => ({
  PanesProvider: wrapWithTestId('panes-provider'),
}));

vi.mock('@/shared/contexts/ShotAdditionSelectionContext', () => ({
  ShotAdditionSelectionProvider: wrapWithTestId('shot-addition-selection-provider'),
}));

vi.mock('@/shared/contexts/LastAffectedShotContext', () => ({
  LastAffectedShotProvider: wrapWithTestId('last-affected-shot-provider'),
}));

vi.mock('@/shared/contexts/CurrentShotContext', () => ({
  CurrentShotProvider: wrapWithTestId('current-shot-provider'),
}));

vi.mock('@/shared/contexts/ToolPageHeaderContext', () => ({
  ToolPageHeaderProvider: wrapWithTestId('tool-page-header-provider'),
}));

describe('AppProviders', () => {
  beforeEach(() => {
    queryClientProviderSpy.mockClear();
    tooltipProviderSpy.mockClear();
  });

  it('composes provider tree and renders initializer + children', () => {
    render(
      <AppProviders>
        <div data-testid="app-child">content</div>
      </AppProviders>,
    );

    expect(screen.getByTestId('query-client-provider')).toBeInTheDocument();
    expect(screen.getByTestId('tooltip-provider')).toBeInTheDocument();
    expect(screen.getByTestId('task-type-config-initializer')).toBeInTheDocument();
    expect(screen.getByTestId('auth-provider')).toBeInTheDocument();
    expect(screen.getByTestId('auth-gate')).toBeInTheDocument();
    expect(screen.getByTestId('user-settings-provider')).toBeInTheDocument();
    expect(screen.getByTestId('project-provider')).toBeInTheDocument();
    expect(screen.getByTestId('realtime-provider')).toBeInTheDocument();
    expect(screen.getByTestId('shots-provider')).toBeInTheDocument();
    expect(screen.getByTestId('generation-task-provider')).toBeInTheDocument();
    expect(screen.getByTestId('incoming-tasks-provider')).toBeInTheDocument();
    expect(screen.getByTestId('panes-provider')).toBeInTheDocument();
    expect(screen.getByTestId('shot-addition-selection-provider')).toBeInTheDocument();
    expect(screen.getByTestId('last-affected-shot-provider')).toBeInTheDocument();
    expect(screen.getByTestId('current-shot-provider')).toBeInTheDocument();
    expect(screen.getByTestId('tool-page-header-provider')).toBeInTheDocument();
    expect(screen.getByTestId('app-child')).toBeInTheDocument();

    expect(queryClientProviderSpy).toHaveBeenCalledWith(queryClient);
    expect(tooltipProviderSpy).toHaveBeenCalledWith(300);
  });
});
