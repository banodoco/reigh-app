import { useCallback, useEffect } from 'react';
import { useAppEventListener } from '@/shared/lib/typedEvents';

export type SettingsCreditsTab = 'purchase' | 'history';

interface SettingsLocationState {
  openSettings?: boolean;
  settingsTab?: string;
  creditsTab?: SettingsCreditsTab;
}

interface SettingsModalIntent {
  settingsTab?: string;
  creditsTab?: SettingsCreditsTab;
}

function parseSettingsLocationState(state: unknown): SettingsLocationState | null {
  if (!state || typeof state !== 'object') return null;
  const record = state as Record<string, unknown>;
  const creditsTab = record.creditsTab === 'purchase' || record.creditsTab === 'history'
    ? record.creditsTab
    : undefined;

  return {
    openSettings: record.openSettings === true,
    settingsTab: typeof record.settingsTab === 'string' ? record.settingsTab : undefined,
    creditsTab,
  };
}

function clearSettingsLocationIntent(): void {
  window.history.replaceState({}, document.title);
}

export function useSettingsRouteIntent(
  routeState: unknown,
  onIntent: (intent: SettingsModalIntent) => void,
): void {
  useEffect(() => {
    const parsed = parseSettingsLocationState(routeState);
    if (!parsed?.openSettings) return;

    onIntent({ settingsTab: parsed.settingsTab, creditsTab: parsed.creditsTab });
    clearSettingsLocationIntent();
  }, [routeState, onIntent]);
}

export function useSettingsEventIntent(
  onIntent: (intent: SettingsModalIntent) => void,
): void {
  const handleOpenSettingsEvent = useCallback(({ tab }: { tab?: string }) => {
    onIntent({ settingsTab: tab });
  }, [onIntent]);

  useAppEventListener('openSettings', handleOpenSettingsEvent);
}
