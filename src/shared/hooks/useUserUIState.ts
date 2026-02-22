import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useRenderLogger } from '@/shared/lib/debugRendering';
import type { Json } from '@/integrations/supabase/types';
import { updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { handleError } from '@/shared/lib/errorHandling/handleError';

// Shared cache to prevent duplicate database calls
interface CachedUserSettingsRow {
  settings?: Json;
}
interface CachedSettingsResult {
  data: CachedUserSettingsRow | null;
  error: unknown;
}
interface SettingsCacheEntry {
  data: CachedSettingsResult | null;
  timestamp: number;
  loading: Promise<CachedSettingsResult> | null;
}
const settingsCache = new Map<string, SettingsCacheEntry>();
const CACHE_DURATION = 30000; // 30 seconds

interface UISettings {
  paneLocks: {
    shots: boolean;
    tasks: boolean;
    gens: boolean;
  };
  settingsModal: {
    activeTab: string;
  };
  videoTravelWidescreen: {
    enabled: boolean;
  };
  imageDeletion?: {
    skipConfirmation: boolean;
  };
  generationMethods: {
    onComputer: boolean;
    inCloud: boolean;
  };
  aiInputMode: {
    mode: 'voice' | 'text';
  };
  privacyDefaults: {
    resourcesPublic: boolean;
    generationsPublic: boolean;
  };
  theme: {
    darkMode: boolean; // Defaults to true (dark mode) for new users
  };
  productTour?: {
    completed: boolean;
    skipped: boolean;
  };
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

// Cached settings loader to prevent duplicate database calls  
const loadUserSettingsCached = async (userId: string) => {
  const cacheKey = `user_settings_${userId}`;
  const cached = settingsCache.get(cacheKey);
  
  // Return fresh cached data
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    return cached.data;
  }
  
  // If there's already a loading request, wait for it
  if (cached?.loading) {
    return await cached.loading;
  }
  
  // Make new database call and cache the promise
  const loadingPromise: Promise<CachedSettingsResult> = (async () => {
    try {
      const result = await supabase
        .from('users')
        .select('settings')
        .eq('id', userId)
        .single();
      const typedResult = result as unknown as CachedSettingsResult;
      settingsCache.set(cacheKey, {
        data: typedResult,
        timestamp: Date.now(),
        loading: null
      });
      return typedResult;
    } catch (error) {
      settingsCache.delete(cacheKey);
      throw error;
    }
  })();
  
  // Cache the loading promise to prevent duplicate requests
  settingsCache.set(cacheKey, {
    data: cached?.data || null,
    timestamp: cached?.timestamp || 0,
    loading: loadingPromise
  });
  
  return await loadingPromise;
};

/**
 * Hook for user-scoped UI preferences (theme, pane locks, generation methods, etc.).
 *
 * Scope: user-only (stored in `users.settings.ui`).
 * Auto-save: yes, 200ms debounce via the global settings write queue.
 *
 * Use this for preferences that follow the user across all projects/shots.
 * For project/shot-scoped settings, use `useAutoSaveSettings` instead.
 *
 * @see docs/structure_detail/settings_system.md for the full settings hook decision tree
 */
export function useUserUIState<K extends keyof UISettings>(
  key: K,
  fallback: UISettings[K]
) {
  // Normalize logic specific to generationMethods to avoid ambiguous "both true" state.
  // Allowed states:
  // - inCloud: true, onComputer: false
  // - inCloud: false, onComputer: true
  // - inCloud: false, onComputer: false (explicitly disabled, used for warnings)
  // Not allowed:
  // - inCloud: true, onComputer: true → normalize to cloud by default
  const normalizeIfGenerationMethods = useCallback((val: UISettings[K]): UISettings[K] => {
    if ((key as string) !== 'generationMethods') return val;
    if (!val || typeof val !== 'object') return val;
    const valObj = val as unknown as Record<string, unknown>;
    const inCloud = Boolean(valObj.inCloud);
    const onComputer = Boolean(valObj.onComputer);
    if (inCloud && onComputer) {
      return { inCloud: true, onComputer: false } as UISettings[K];
    }
    return { inCloud, onComputer } as UISettings[K];
  }, [key]);

  // Stabilize fallback using a ref so callers can pass inline objects without causing
  // infinite render loops. The load effect reads fallbackRef.current instead of depending
  // on fallback directly, preventing re-runs when the reference changes but values don't.
  const fallbackRef = useRef<UISettings[K]>(fallback);
  fallbackRef.current = fallback;

  useRenderLogger(`UserUIState:${key}`);

  const [value, setValue] = useState<UISettings[K]>(fallback);
  const [isLoading, setIsLoading] = useState(true);
  const userIdRef = useRef<string>();
  const debounceRef = useRef<NodeJS.Timeout>();
  // Ref so that `update` can read the latest value without depending on it
  const valueRef = useRef(value);
  valueRef.current = value;

  // Helper function to save fallback values to database (preserves all existing settings)
  // This automatically backfills existing users with default values when they first load the app
  // IMPORTANT: Only runs when the key is completely missing from database (undefined)
  // Does NOT override explicit user choices (including both options set to false)
  const saveFallbackToDatabase = useCallback(async (userId: string, _currentSettings: Record<string, unknown>) => {
    try {
      const fallbackToSave = normalizeIfGenerationMethods(fallbackRef.current);

      // Use the global queue to save - it handles merging
      await updateToolSettingsSupabase({
        scope: 'user',
        id: userId,
        toolId: 'ui',
        patch: { [key]: fallbackToSave },
      }, undefined, 'immediate');

      // Invalidate cache so other components see the backfilled values
      const cacheKey = `user_settings_${userId}`;
      settingsCache.delete(cacheKey);
      setValue(fallbackToSave); // Update local state after successful save
    } catch (error) {
      handleError(error, { context: 'useUserUIState.saveFallbackToDatabase', showToast: false });
    }
  }, [key, normalizeIfGenerationMethods]);

  // Load initial value from database
  useEffect(() => {
    const loadUserSettings = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          // Skip loading for unauthenticated users (e.g., on public share pages)
          setIsLoading(false);
          return;
        }

        userIdRef.current = user.id;

        const cachedResult = await loadUserSettingsCached(user.id);
        const data = cachedResult?.data ?? null;
        const error = cachedResult?.error ?? null;

        if (error) {
          handleError(error, { context: 'useUserUIState.loadSettings', showToast: false });
          setIsLoading(false);
          return;
        }

        const settingsRecord = toRecord(data?.settings);
        const uiSettings = toRecord(settingsRecord?.ui);
        const keyValue = uiSettings?.[key];
        
        if (keyValue !== undefined) {
          // Key exists in database - merge with fallback to backfill any missing fields
          const currentFallback = fallbackRef.current;
          const mergedValue = (typeof currentFallback === 'object' && currentFallback !== null)
            ? ({ ...currentFallback, ...(keyValue as object) } as UISettings[K])
            : (keyValue as UISettings[K]);

          const normalizedValue = normalizeIfGenerationMethods(mergedValue);
          setValue(normalizedValue);

          // If any fields from the fallback are missing in the stored value OR
          // normalization changed the value, backfill them in DB
          if (
            (typeof keyValue === 'object' && keyValue !== null &&
            typeof currentFallback === 'object' && currentFallback !== null &&
            Object.keys(currentFallback as object).some((k) => (keyValue as Record<string, unknown>)[k] === undefined)) ||
            JSON.stringify(normalizedValue) !== JSON.stringify(keyValue)
          ) {
            // Use the global queue to save - it handles merging
            updateToolSettingsSupabase({
              scope: 'user',
              id: user.id,
              toolId: 'ui',
              patch: { [key]: normalizedValue },
            }, undefined, 'immediate').then(() => {
              const cacheKey = `user_settings_${user.id}`;
              settingsCache.delete(cacheKey);
            }).catch(e => {
              handleError(e, { context: 'useUserUIState.backfillFields', showToast: false });
            });
          }
        } else {
          // Key doesn't exist in database - this is an existing user who hasn't set preferences yet
          // Save fallback values to backfill them (only runs when completely empty)
          const normalizedFallback = normalizeIfGenerationMethods(fallbackRef.current);
          setValue(normalizedFallback); // Set normalized fallback immediately for responsive UI

          // Save to database in background (don't block loading)
          saveFallbackToDatabase(user.id, settingsRecord || {}).catch(error => {
            handleError(error, { context: 'useUserUIState.saveFallback', showToast: false });
          });
        }

        setIsLoading(false);
      } catch (error) {
        handleError(error, { context: 'useUserUIState.loadUserSettings', showToast: false });
        setIsLoading(false);
      }
    };

    loadUserSettings();
  }, [key, normalizeIfGenerationMethods, saveFallbackToDatabase]);

  // Debounced update function
  // Uses the global settings write queue (via updateToolSettingsSupabase) to prevent
  // race conditions with other hooks that write to users.settings (e.g., useToolSettings
  // writing user-preferences). The write queue serializes writes and uses an atomic RPC.
  const update = useCallback((patch: Partial<UISettings[K]>) => {
    // Immediately update local state for responsive UI (with normalization)
    const normalizedPatch = normalizeIfGenerationMethods({
      ...(valueRef.current as object),
      ...(patch as object)
    } as UISettings[K]);
    setValue(normalizedPatch);

    // Clear existing timeout
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce the database write via the global settings write queue
    debounceRef.current = setTimeout(async () => {
      const userId = userIdRef.current;
      if (!userId) return;

      try {
        // Use the write queue which handles atomic DB updates and merging.
        // This prevents race conditions with other hooks writing to users.settings.
        await updateToolSettingsSupabase({
          scope: 'user',
          id: userId,
          toolId: 'ui',
          patch: { [key]: normalizedPatch },
        });

        // Invalidate local cache so other useUserUIState instances see the update
        const cacheKey = `user_settings_${userId}`;
        settingsCache.delete(cacheKey);
      } catch (error) {
        handleError(error, { context: 'useUserUIState.update', showToast: false });
      }
    }, 200);
  }, [key, normalizeIfGenerationMethods]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return useMemo(() => ({
    value,
    update,
    isLoading
  }), [value, update, isLoading]);
} 
