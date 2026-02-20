import {
  createContext,
  useState,
  useContext,
  ReactNode,
  useEffect,
  useRef,
  useCallback,
  useMemo
} from 'react';
import { supabase } from '@/integrations/supabase/client';
import { UserPreferences } from '@/shared/settings/userPreferences';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { useMobileTimeoutFallback } from '@/shared/hooks/useMobileTimeoutFallback';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { useAuth } from './AuthContext';

interface UserSettingsContextType {
  /** User settings from the server (cross-device, account-level) */
  userSettings: UserPreferences | undefined;
  /** Whether settings are currently loading */
  isLoadingSettings: boolean;
  /** Fetch user settings from the server */
  fetchUserSettings: () => Promise<void>;
  /** Update user settings (persisted to server, syncs across devices) */
  updateUserSettings: (scope: 'user', patch: Partial<UserPreferences>) => Promise<void>;
}

const UserSettingsContext = createContext<UserSettingsContextType | undefined>(undefined);

/**
 * UserSettingsProvider manages server-persisted user settings.
 * These settings sync across devices (stored in users.settings['user-preferences']).
 *
 * Features:
 * - [MobileStallFix] Timeout and recovery handling for settings loading
 * - Optimistic updates for better UX
 * - Depends on AuthContext for userId
 */
export const UserSettingsProvider = ({ children }: { children: ReactNode }) => {
  const { userId } = useAuth();

  const [userSettings, setUserSettings] = useState<UserPreferences | undefined>(undefined);
  const [isLoadingSettings, setIsLoadingSettings] = useState(false);
  const userSettingsRef = useRef<UserPreferences | undefined>(undefined);

  // Settings fetching
  const fetchUserSettings = useCallback(async () => {
    if (!userId) return;

    setIsLoadingSettings(true);

    try {
      // Read the settings JSON for the current user
      const { data, error } = await supabase
        .from('users')
        .select('settings')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const settings = (data?.settings as Record<string, unknown> | null)?.['user-preferences'] as UserPreferences ?? {};
      setUserSettings(settings);
      userSettingsRef.current = settings;
    } catch (error) {
      handleError(error, { context: 'UserSettingsContext', showToast: false });
      // Set empty settings on error instead of leaving undefined
      setUserSettings({});
      userSettingsRef.current = {};
    } finally {
      setIsLoadingSettings(false);
    }
  }, [userId]);

  // Update user settings directly using the global write queue
  const updateUserSettings = useCallback(async (_scope: 'user', patch: Partial<UserPreferences>) => {
    if (!userId) return;

    try {
      // Use the global queue - it handles read-modify-write internally
      await updateToolSettingsSupabase({
        scope: 'user',
        id: userId,
        toolId: 'user-preferences',
        patch,
      });

      // Update local state optimistically
      setUserSettings(prev => {
        const merged = { ...prev, ...patch };
        userSettingsRef.current = merged;
        return merged;
      });
    } catch (error) {
      handleError(error, { context: 'UserSettingsContext', showToast: false });
    }
  }, [userId]);

  // Fetch settings when user changes
  useEffect(() => {
    if (userId) {
      fetchUserSettings();
    } else {
      setUserSettings(undefined);
      userSettingsRef.current = undefined;
      setIsLoadingSettings(false);
    }
  }, [userId, fetchUserSettings]);

  // [MobileStallFix] Fallback recovery: set empty defaults if settings loading stalls
  const handleSettingsTimeout = useCallback(() => {
    setIsLoadingSettings(false);
    setUserSettings({});
    userSettingsRef.current = {};
  }, []);

  useMobileTimeoutFallback({
    isLoading: isLoadingSettings,
    onTimeout: handleSettingsTimeout,
    mobileTimeoutMs: 10000,
    desktopTimeoutMs: 5000,
    enabled: !!userId,
  });

  const contextValue = useMemo(
    () => ({
      userSettings,
      isLoadingSettings,
      fetchUserSettings,
      updateUserSettings,
    }),
    [userSettings, isLoadingSettings, fetchUserSettings, updateUserSettings]
  );

  return (
    <UserSettingsContext.Provider value={contextValue}>
      {children}
    </UserSettingsContext.Provider>
  );
};

/**
 * Hook to access user settings (server-persisted, cross-device).
 *
 * For device-local preferences (like sound on/off), use useLocalPreferences instead.
 *
 * @returns { userSettings, isLoadingSettings, fetchUserSettings, updateUserSettings }
 */
export const useUserSettings = () => {
  const context = useContext(UserSettingsContext);
  if (context === undefined) {
    const errorMessage = 'useUserSettings must be used within a UserSettingsProvider. ' +
      'Make sure the component is rendered inside the UserSettingsProvider tree.';
    console.error('[UserSettingsContext]', errorMessage, {
      stack: new Error().stack,
    });
    throw new Error(errorMessage);
  }
  return context;
};

