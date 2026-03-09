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
import { getSupabaseClient as supabase } from '../../integrations/supabase/client';
import { UserPreferences } from '../settings/userPreferences';
import { updateToolSettingsSupabase } from '../hooks/settings/useToolSettings';
import { useMobileTimeoutFallback } from '../hooks/useMobileTimeoutFallback';
import { normalizeAndPresentError } from '../lib/errorHandling/runtimeError';
import { SETTINGS_IDS } from '../lib/settingsIds';
import { ToolSettingsError } from '../lib/toolSettingsService';
import { useAuth } from './AuthContext';
import { requireContextValue } from './contextGuard';

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
      const { data, error } = await supabase().from('users')
        .select('settings')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const settings = (data?.settings as Record<string, unknown> | null)?.[SETTINGS_IDS.USER_PREFERENCES] as UserPreferences ?? {};
      setUserSettings(settings);
      userSettingsRef.current = settings;
    } catch (error) {
      normalizeAndPresentError(error, { context: 'UserSettingsContext', showToast: false });
      // Set empty settings on error instead of leaving undefined
      setUserSettings({});
      userSettingsRef.current = {};
    } finally {
      setIsLoadingSettings(false);
    }
  }, [userId]);

  // Update user settings directly using the global write queue
  const updateUserSettings = useCallback(async (_scope: 'user', patch: Partial<UserPreferences>) => {
    if (!userId) {
      const authError = new ToolSettingsError(
        'auth_required',
        'Authentication required for user settings update',
      );
      normalizeAndPresentError(authError, {
        context: 'UserSettingsContext.updateUserSettings',
        showToast: false,
      });
      throw authError;
    }

    try {
      // Use the global queue - it handles read-modify-write internally
      await updateToolSettingsSupabase({
        scope: 'user',
        id: userId,
        toolId: SETTINGS_IDS.USER_PREFERENCES,
        patch,
      });

      // Update local state optimistically
      setUserSettings(prev => {
        const merged = { ...prev, ...patch };
        userSettingsRef.current = merged;
        return merged;
      });
    } catch (error) {
      normalizeAndPresentError(error, { context: 'UserSettingsContext', showToast: false });
      throw error;
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
  return requireContextValue(
    useContext(UserSettingsContext),
    'useUserSettings',
    'UserSettingsProvider',
  );
};
