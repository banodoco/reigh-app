import { useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  SettingsCreditsTab,
  useSettingsEventIntent,
  useSettingsRouteIntent,
} from '@/app/hooks/useSettingsModalIntents';

export function useSettingsModal() {
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [settingsCreditsTab, setSettingsCreditsTab] = useState<SettingsCreditsTab | undefined>(undefined);
  const location = useLocation();

  const handleOpenSettings = useCallback((initialTab?: string, creditsTab?: SettingsCreditsTab) => {
    setSettingsInitialTab(initialTab);
    setSettingsCreditsTab(creditsTab);
    setIsSettingsModalOpen(true);
  }, []);

  useSettingsRouteIntent(location.state, useCallback(({ settingsTab, creditsTab }) => {
    handleOpenSettings(settingsTab, creditsTab);
  }, [handleOpenSettings]));

  useSettingsEventIntent(useCallback(({ settingsTab }) => {
    handleOpenSettings(settingsTab);
  }, [handleOpenSettings]));

  return {
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    settingsInitialTab,
    settingsCreditsTab,
    handleOpenSettings,
  };
}
