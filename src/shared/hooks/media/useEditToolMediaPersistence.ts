import { getSupabaseClient } from '@/integrations/supabase/client';
import { useState, useEffect, useRef, useCallback } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { useToolSettings, type SettingsScope } from '@/shared/hooks/settings/useToolSettings';

const getSupabase = () => getSupabaseClient();

/**
 * Shared hook for edit tool media persistence.
 * Handles loading last-edited media from project settings on mount,
 * preloading the media URL, and saving selection changes back to settings.
 *
 * Used by EditImagesPage and EditVideoPage.
 */

interface UseEditToolMediaPersistenceParams {
  /** The tool settings key, e.g. 'edit-images-ui' */
  settingsToolId: string;
  /** Current project ID */
  projectId: string | undefined;
  /** Called after a generation is fetched from DB, before setting it as selected.
   *  Use this to preload images/posters. */
  preloadMedia?: (generation: GenerationRow) => void;
  /** Called after successfully loading persisted generation from DB.
   *  Use this to restore extra state like video segments.
   *  Receives the full settings object. */
  onSettingsLoaded?: (settings: Record<string, unknown>) => void;
  /** Extra data to merge when clearing settings on editor close.
   *  e.g. { lastEditedMediaSegments: null } for video.
   *  Use null, not undefined — deepMerge skips undefined values. */
  extraClearData?: Record<string, unknown>;
}

interface UseEditToolMediaPersistenceReturn {
  /** The selected media from persisted settings, or null */
  selectedMedia: GenerationRow | null;
  /** Set the selected media (also persists to settings) */
  setSelectedMedia: (media: GenerationRow | null) => void;
  /** Call this when user explicitly closes the editor */
  handleEditorClose: () => void;
  /** Whether settings are loading or persisted media is being fetched */
  isLoading: boolean;
  /** Whether we have a stored ID that hasn't resolved yet (for skeleton display) */
  showSkeleton: boolean;
  /** The raw UI settings object */
  uiSettings: Record<string, unknown> | undefined;
  /** The update function from useToolSettings */
  updateUISettings: (scope: SettingsScope, settings: Record<string, unknown>) => Promise<void>;
  /** Whether the underlying tool settings are loading */
  isUISettingsLoading: boolean;
  /** Ref tracking whether user explicitly closed the editor */
  userClosedEditor: React.MutableRefObject<boolean>;
}

export function useEditToolMediaPersistence({
  settingsToolId,
  projectId,
  preloadMedia,
  onSettingsLoaded,
  extraClearData,
}: UseEditToolMediaPersistenceParams): UseEditToolMediaPersistenceReturn {
  const [selectedMedia, setSelectedMediaState] = useState<GenerationRow | null>(null);
  const [isLoadingPersistedMedia, setIsLoadingPersistedMedia] = useState(false);

  // Track if we've already loaded from settings to prevent re-loading
  const hasLoadedFromSettings = useRef(false);
  // Track if user has explicitly closed the editor (vs initial mount state)
  const userClosedEditor = useRef(false);

  // Project-level UI settings for persisting last edited media
  const {
    settings: uiSettings,
    update: updateUISettings,
    isLoading: isUISettingsLoading,
  } = useToolSettings<Record<string, unknown>>(settingsToolId, {
    projectId,
    enabled: !!projectId,
  });

  // Load last edited media from database settings on mount
  useEffect(() => {
    if (!projectId || isUISettingsLoading || hasLoadedFromSettings.current) return;

    const storedId = uiSettings?.lastEditedMediaId as string | undefined;
    hasLoadedFromSettings.current = true; // Mark as attempted even if no stored ID

    if (storedId && !selectedMedia) {
      setIsLoadingPersistedMedia(true);
      getSupabase()
        .from('generations')
        .select('*')
        .eq('id', storedId)
        .single()
        .then(({ data, error }) => {
          if (data && !error) {
            const gen = data as GenerationRow;
            preloadMedia?.(gen);
            setSelectedMediaState(gen);
            // Let caller restore extra state from settings
            if (onSettingsLoaded && uiSettings) {
              onSettingsLoaded(uiSettings);
            }
          } else {
            // Clear invalid stored ID (use null, not undefined — deepMerge skips undefined)
            updateUISettings('project', {
              lastEditedMediaId: null,
              ...extraClearData,
            });
          }
          setIsLoadingPersistedMedia(false);
        });
    }
  }, [projectId, uiSettings?.lastEditedMediaId, isUISettingsLoading, selectedMedia, updateUISettings, preloadMedia, onSettingsLoaded, uiSettings, extraClearData]);

  // Persist selected media ID to database settings (or clear it when media is removed)
  const selectedMediaId = selectedMedia?.id;
  useEffect(() => {
    if (!projectId || isUISettingsLoading || !hasLoadedFromSettings.current) return;

    if (selectedMediaId && selectedMediaId !== (uiSettings?.lastEditedMediaId as string | undefined)) {
      updateUISettings('project', { lastEditedMediaId: selectedMediaId });
      userClosedEditor.current = false; // Reset close flag when new media selected
    } else if (!selectedMediaId && uiSettings?.lastEditedMediaId && userClosedEditor.current) {
      // Only clear when user explicitly closed the editor, not on initial mount
      // Use null, not undefined — deepMerge skips undefined values
      updateUISettings('project', {
        lastEditedMediaId: null,
        ...extraClearData,
      });
    }
  }, [selectedMediaId, projectId, isUISettingsLoading, uiSettings?.lastEditedMediaId, updateUISettings, extraClearData]);

  // Wrapper to set media from outside (e.g. gallery selection, upload result)
  const setSelectedMedia = useCallback((media: GenerationRow | null) => {
    setSelectedMediaState(media);
  }, []);

  // Call when user explicitly closes the editor
  const handleEditorClose = useCallback(() => {
    userClosedEditor.current = true;
    setSelectedMediaState(null);
  }, []);

  const showSkeleton = isUISettingsLoading || isLoadingPersistedMedia ||
    (!!uiSettings?.lastEditedMediaId && !selectedMedia && !userClosedEditor.current);

  return {
    selectedMedia,
    setSelectedMedia,
    handleEditorClose,
    isLoading: isUISettingsLoading || isLoadingPersistedMedia,
    showSkeleton,
    uiSettings,
    updateUISettings,
    isUISettingsLoading,
    userClosedEditor,
  };
}
