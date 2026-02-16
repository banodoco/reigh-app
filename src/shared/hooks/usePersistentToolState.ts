import { useRef, useEffect, useState, useCallback } from 'react';
import { useToolSettings, SettingsScope } from './useToolSettings';
import { deepEqual, sanitizeSettings } from '../lib/deepEqual';
import { handleError } from '@/shared/lib/errorHandler';
import { toolDefaultsRegistry } from '@/tooling/toolDefaultsRegistry';

/**
 * Infer an appropriate "empty" value for a given value based on its type.
 * 
 * IMPORTANT: This is a SAFETY NET for fields that are persisted but don't have
 * explicit defaults defined in their tool's settings.ts file. This prevents stale
 * state from previous projects from persisting when switching projects.
 * 
 * BEST PRACTICE: All persisted fields should have explicit defaults in settings.ts,
 * even if those defaults are empty (e.g., prompts: [], batchVideoPrompt: '').
 * This makes the "contract" of what gets persisted clear and self-documenting.
 * 
 * @param value - The current state value to infer an empty value from
 * @returns An appropriate empty value based on the type of the input
 */
function inferEmptyValue(value: unknown): unknown {
  if (Array.isArray(value)) return [];
  if (typeof value === 'object' && value !== null) return {};
  if (typeof value === 'string') return '';
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  return undefined;
}

interface StateMapping<T> {
  [key: string]: [T[keyof T], React.Dispatch<React.SetStateAction<T[keyof T]>>];
}

interface UsePersistentToolStateOptions {
  debounceMs?: number;
  scope?: SettingsScope;
  /**
   * If false, the hook will skip fetching/saving settings and immediately report ready=true.
   * Useful when the relevant entity (e.g. project) has not been selected yet.
   */
  enabled?: boolean;
  /**
   * Explicit defaults for fields that aren't in the tools manifest.
   * Use this for non-tool callers (e.g. PromptEditorModal) to avoid
   * the "no default value" warning and ensure correct reset behavior.
   */
  defaults?: Record<string, unknown>;
}

interface UsePersistentToolStateResult {
  ready: boolean;
  isSaving: boolean;
  saveError?: Error;
  hasUserInteracted: boolean;
  markAsInteracted: () => void;
}

/**
 * Hook that synchronizes existing `useState` variables with persistent tool settings.
 *
 * Unlike `useAutoSaveSettings` which owns its own state, this hook binds to
 * pre-existing `[value, setter]` pairs -- useful when the form already manages
 * its own `useState` and you want to add persistence without restructuring.
 *
 * Key difference from `useAutoSaveSettings`: the `markAsInteracted()` guard.
 * Settings are only saved after the user explicitly interacts, preventing
 * auto-initialization effects from being persisted as user choices.
 *
 * For new features, prefer `useAutoSaveSettings` unless you specifically need
 * the bind-to-existing-useState pattern or the interaction guard.
 *
 * @param toolId - The tool identifier (e.g., 'image-generation', 'video-travel')
 * @param context - Context for settings resolution (projectId, shotId, etc.)
 * @param stateMapping - Object mapping setting keys to [value, setter] tuples
 * @param options - Additional options for behavior customization
 * @returns Object with ready state, saving state, and interaction tracking
 *
 * @see docs/structure_detail/settings_system.md for the full settings hook decision tree
 *
 * @example
 * const { ready, isSaving, markAsInteracted } = usePersistentToolState(
 *   'image-generation',
 *   { projectId },
 *   {
 *     generationMode: [generationMode, setGenerationMode],
 *     imagesPerPrompt: [imagesPerPrompt, setImagesPerPrompt],
 *   }
 * );
 * // Call markAsInteracted() in onChange handlers to enable persistence
 */
export function usePersistentToolState<T extends Record<string, unknown>>(
  toolId: string,
  context: { projectId?: string; shotId?: string },
  stateMapping: StateMapping<T>,
  options: UsePersistentToolStateOptions = {}
): UsePersistentToolStateResult {
  const { debounceMs = 500, scope = 'project', enabled = true, defaults: explicitDefaults } = options;

  // Obtain current settings and mutation helpers
  const {
    settings,
    isLoading: isLoadingSettings,
    update: updateSettings,
    isUpdating,
  } = useToolSettings<T>(toolId, { ...context, enabled });

  // Track hydration and interaction state
  const hasHydratedRef = useRef(false);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userHasInteractedRef = useRef(false);
  const lastSavedSettingsRef = useRef<T | null>(null);
  const hydratedForEntityRef = useRef<string | null>(null);

  // Public state for consumers
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState<Error | undefined>();
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Get a unique key for the current entity (project/shot)
  const entityKey = scope === 'shot' ? context.shotId : context.projectId;

  // Reset hydration when entity changes
  useEffect(() => {
    if (entityKey !== hydratedForEntityRef.current) {
      hasHydratedRef.current = false;
      userHasInteractedRef.current = false;
      lastSavedSettingsRef.current = null;
      hydratedForEntityRef.current = entityKey || null;
      setReady(false);
      setHasUserInteracted(false);
    }
  }, [entityKey, toolId]);

  // Hydrate local state from persisted settings
  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!isLoadingSettings && !hasHydratedRef.current && entityKey) {
      // Use an empty object if settings could not be fetched (e.g. first time or API failure)
      const effectiveSettings: Partial<T> = (settings as Partial<T>) || {};
      
      // Get defaults for this tool to reset undefined values
      const toolDefaults = explicitDefaults || toolDefaultsRegistry[toolId] || {};
      
      hasHydratedRef.current = true;
      userHasInteractedRef.current = false;
      
      // Apply each setting to its corresponding setter
      // CRITICAL FIX: Always reset values when switching projects to prevent stale state
      Object.entries(stateMapping).forEach(([key, [currentValue, setter]]) => {
        if (effectiveSettings[key as keyof T] !== undefined) {
          // Value exists in DB - use it
          setter(effectiveSettings[key as keyof T] as T[keyof T]);
        } else if (toolDefaults[key as keyof typeof toolDefaults] !== undefined) {
          // Value missing in DB but has a default - reset to default
          setter(toolDefaults[key as keyof typeof toolDefaults] as T[keyof T]);
        } else {
          // SAFETY NET: No value in DB and no default - infer empty value from current type
          // This prevents stale state but ideally all fields should have explicit defaults
          const emptyValue = inferEmptyValue(currentValue);
          
          // Warn in development if we're using inference (indicates missing default)
          if (process.env.NODE_ENV === 'development') {
            console.warn(
              `[usePersistentToolState] Field "${key}" in tool "${toolId}" has no default value. ` +
              `Inferring empty value (${JSON.stringify(emptyValue)}). ` +
              `Consider adding explicit default in settings.ts`
            );
          }
          
          setter(emptyValue as T[keyof T]);
        }
      });

      // Mark as ready after hydration
      setReady(true);
    }
  }, [settings, isLoadingSettings, stateMapping, entityKey, toolId]);

  // Collect current state values from the mapping
  const getCurrentState = useCallback((): T => {
    const currentState: Record<string, unknown> = {};
    Object.entries(stateMapping).forEach(([key, [value]]) => {
      currentState[key] = value;
    });
    return currentState as T;
  }, [stateMapping]);

  // Function to mark that user has interacted
  const markAsInteracted = useCallback(() => {
    if (!enabled) {
      return;
    }
    userHasInteractedRef.current = true;
    setHasUserInteracted(true);
  }, [enabled]);

  const noopMarkAsInteracted = useCallback(() => {}, []);

  // Save settings with debouncing and deep comparison
  useEffect(() => {
    if (!enabled || !entityKey || !settings || !hasHydratedRef.current || !userHasInteractedRef.current) {
      return;
    }

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce the save
    saveTimeoutRef.current = setTimeout(async () => {
      const currentState = getCurrentState();
      
      // Check if we just saved these exact settings
      if (lastSavedSettingsRef.current && 
          deepEqual(sanitizeSettings(currentState), sanitizeSettings(lastSavedSettingsRef.current))) {
        return;
      }

      // Check if settings actually changed from what's in the database
      if (!isUpdating && !deepEqual(sanitizeSettings(currentState), sanitizeSettings(settings))) {
        try {
          lastSavedSettingsRef.current = currentState;
          await updateSettings(scope, currentState);
          setSaveError(undefined);
        } catch (error) {
          handleError(error, { context: 'usePersistentToolState', showToast: false });
          setSaveError(error as Error);
        }
      }
    }, Math.min(debounceMs, 100)); // Cap debounce at 100ms for performance

    // Cleanup timeout on unmount or dependencies change
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    entityKey,
    settings,
    getCurrentState,
    updateSettings,
    isUpdating,
    scope,
    debounceMs,
    toolId,
    // Include all state values to trigger saves on change
    ...Object.entries(stateMapping).map(([_, [value]]) => value)
  ]);

  return {
    ready: enabled ? ready : true,
    isSaving: enabled ? isUpdating : false,
    saveError: enabled ? saveError : undefined,
    hasUserInteracted: enabled ? hasUserInteracted : false,
    markAsInteracted: enabled ? markAsInteracted : noopMarkAsInteracted,
  };
}
