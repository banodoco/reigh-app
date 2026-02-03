import { useCallback, useEffect, useRef } from 'react';
import { useToolSettings } from '@/shared/hooks/useToolSettings';

// Import canonical types from single source of truth
import {
  type EditMode,
  type LoraMode,
  type EditAdvancedSettings,
  type LastUsedEditSettings,
  type VideoEditSubMode,
  type PanelMode,
  type SyncedSettingKey,
  DEFAULT_LAST_USED,
  DEFAULT_ADVANCED_SETTINGS,
  SYNCED_SETTING_KEYS,
} from './editSettingsTypes';

// Re-export types for backwards compatibility
export type { LastUsedEditSettings, VideoEditSubMode, PanelMode };

// localStorage keys for instant access (no loading delay)
const STORAGE_KEY_PROJECT = (projectId: string) => `lightbox-edit-last-used-${projectId}`;
const STORAGE_KEY_GLOBAL = 'lightbox-edit-last-used-global';

export interface UseLastUsedEditSettingsReturn {
  lastUsed: LastUsedEditSettings;
  updateLastUsed: (settings: Partial<LastUsedEditSettings>) => void;
  isLoading: boolean;
}

interface UseLastUsedEditSettingsProps {
  projectId: string | null;
  enabled?: boolean;
}

/**
 * Compares two LastUsedEditSettings objects to detect changes.
 * Uses SYNCED_SETTING_KEYS for synced fields, plus user-preference fields.
 */
function hasSettingsChanged(prev: LastUsedEditSettings, next: LastUsedEditSettings): boolean {
  // Check synced settings (using the canonical list)
  for (const key of SYNCED_SETTING_KEYS) {
    if (key === 'advancedSettings') {
      // Deep compare for objects
      if (JSON.stringify(prev.advancedSettings) !== JSON.stringify(next.advancedSettings)) {
        return true;
      }
    } else {
      // Shallow compare for primitives
      if (prev[key as keyof LastUsedEditSettings] !== next[key as keyof LastUsedEditSettings]) {
        return true;
      }
    }
  }

  // Check user-preference settings
  if (prev.editMode !== next.editMode) return true;
  if (prev.videoEditSubMode !== next.videoEditSubMode) return true;
  if (prev.panelMode !== next.panelMode) return true;

  return false;
}

/**
 * Hook for managing "last used" edit settings
 *
 * Storage strategy (following shotSettingsInheritance pattern):
 * 1. localStorage (project-specific) - instant access
 * 2. localStorage (global) - fallback for new projects
 * 3. useToolSettings (user → project) - cross-device sync
 *
 * On update: saves to all locations
 * On load: localStorage first (instant), then syncs from DB
 */
export function useLastUsedEditSettings({
  projectId,
  enabled = true,
}: UseLastUsedEditSettingsProps): UseLastUsedEditSettingsReturn {

  // Database storage via useToolSettings (cascades: user → project)
  const {
    settings: dbSettings,
    isLoading: isDbLoading,
    update: updateDbSettings,
  } = useToolSettings<LastUsedEditSettings>('lightbox-edit', {
    projectId: projectId || undefined,
    enabled: enabled && !!projectId,
  });

  // Track if we've synced from DB yet
  const hasSyncedFromDbRef = useRef(false);
  const lastProjectIdRef = useRef<string | null>(null);

  // Get instant localStorage value (for zero-delay loading)
  const getLocalStorageValue = useCallback((): LastUsedEditSettings => {
    if (!projectId) return DEFAULT_LAST_USED;

    try {
      // Try project-specific first
      const projectStored = localStorage.getItem(STORAGE_KEY_PROJECT(projectId));
      if (projectStored) {
        const parsed = JSON.parse(projectStored);
        const merged = { ...DEFAULT_LAST_USED, ...parsed };
        return merged;
      }

      // Fall back to global (for new projects)
      const globalStored = localStorage.getItem(STORAGE_KEY_GLOBAL);
      if (globalStored) {
        const parsed = JSON.parse(globalStored);
        const merged = { ...DEFAULT_LAST_USED, ...parsed };
        return merged;
      }
    } catch (e) {
      // Failed to read localStorage
    }

    return DEFAULT_LAST_USED;
  }, [projectId]);

  // Use ref for current value to avoid re-render on every access
  // Lazy initialization to prevent getLocalStorageValue from running every render
  const currentValueRef = useRef<LastUsedEditSettings | null>(null);
  if (currentValueRef.current === null) {
    currentValueRef.current = getLocalStorageValue();
  }

  // Reset on project change
  useEffect(() => {
    if (projectId !== lastProjectIdRef.current) {
      console.log('[EDIT_DEBUG] 🔄 LAST-USED: Project changed');
      console.log('[EDIT_DEBUG] 🔄 LAST-USED: from:', lastProjectIdRef.current?.substring(0, 8) || 'none');
      console.log('[EDIT_DEBUG] 🔄 LAST-USED: to:', projectId?.substring(0, 8) || 'none');
      lastProjectIdRef.current = projectId;
      hasSyncedFromDbRef.current = false;
      currentValueRef.current = getLocalStorageValue();
    }
  }, [projectId, getLocalStorageValue]);

  // Sync from DB when loaded (DB is source of truth for cross-device)
  useEffect(() => {
    if (!isDbLoading && dbSettings && !hasSyncedFromDbRef.current && projectId) {
      hasSyncedFromDbRef.current = true;

      // Merge DB settings (may have newer values from other device)
      const merged = { ...currentValueRef.current, ...dbSettings };
      currentValueRef.current = merged;

      console.log('[PanelRestore] Synced from DB:', { panelMode: merged.panelMode });

      // Update localStorage with DB values
      try {
        localStorage.setItem(STORAGE_KEY_PROJECT(projectId), JSON.stringify(merged));
        localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(merged));
      } catch (e) {
        console.warn('[EDIT_DEBUG] ❌ LAST-USED SYNC: Failed to sync to localStorage:', e);
      }
    }
  }, [isDbLoading, dbSettings, projectId]);

  // Update all storage locations
  const updateLastUsed = useCallback((updates: Partial<LastUsedEditSettings>) => {
    const prev = currentValueRef.current!;
    const merged = { ...prev, ...updates };

    // Check if anything actually changed
    if (!hasSettingsChanged(prev, merged)) {
      console.log('[EDIT_DEBUG] 💾 LAST-USED SAVE: No changes detected, skipping save');
      return;
    }

    currentValueRef.current = merged;

    // Only log panelMode changes for PanelRestore debugging
    if (prev.panelMode !== merged.panelMode) {
      console.log('[PanelRestore] PERSISTING to localStorage:', { panelMode: merged.panelMode });
    }

    // 1. Update localStorage (instant for next time)
    try {
      if (projectId) {
        localStorage.setItem(STORAGE_KEY_PROJECT(projectId), JSON.stringify(merged));
      }
      localStorage.setItem(STORAGE_KEY_GLOBAL, JSON.stringify(merged));
    } catch (e) {
      console.warn('[PanelRestore] Failed to save to localStorage:', e);
    }

    // 2. Update database (cross-device sync)
    // Save at user level only - "last used" is a personal preference, not project-specific
    void updateDbSettings('user', merged).catch(() => {
      // Swallow to avoid spam - useToolSettings handles errors
    });
  }, [projectId, updateDbSettings]);

  return {
    lastUsed: currentValueRef.current!,
    updateLastUsed,
    isLoading: isDbLoading && !hasSyncedFromDbRef.current,
  };
}
