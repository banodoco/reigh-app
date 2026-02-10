import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useProject } from '@/shared/contexts/ProjectContext';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import {
  useVideoTravelData,
  useHashDeepLink,
  useUrlSync,
  useSelectedShotResolution,
  useStableSkeletonVisibility,
} from '../hooks';
import { ShotListView } from './ShotListView';
import { ShotEditorView, ShotEditorLoading, ShotEditorNotFound } from './ShotEditorView';

/**
 * VideoTravelToolPage - Main page for the travel-between-images tool.
 *
 * This is a thin router that:
 * 1. Handles project/shot resolution from URL hash
 * 2. Decides whether to show list view or editor view
 * 3. Delegates all logic to child components
 */
const VideoTravelToolPage: React.FC = () => {
  const location = useLocation();
  const viaShotClick = location.state?.fromShotClick === true;
  const shotFromState = location.state?.shotData;
  const isNewlyCreatedShot = location.state?.isNewlyCreated === true;

  const { selectedProjectId, setSelectedProjectId, projects } = useProject();
  const { currentShotId, setCurrentShotId } = useCurrentShot();

  // Get current project's aspect ratio
  const currentProject = projects.find(project => project.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;

  // Scroll to top on initial mount and when returning to main view
  const prevHashRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    const hasHash = location.hash && location.hash.length > 1;
    const hadHash = prevHashRef.current !== null && prevHashRef.current.length > 1;

    if (!hasHash && (prevHashRef.current === null || hadHash)) {
      window.scrollTo(0, 0);
      window.dispatchEvent(new CustomEvent('app:scrollToTop', { detail: { behavior: 'auto' } }));
    }

    prevHashRef.current = location.hash;
  }, [location.hash]);

  // Fetch shots and related data
  const {
    shots,
    shotsLoading,
    shotsError,
    refetchShots,
    availableLoras,
    projectUISettings,
    updateProjectUISettings,
    uploadSettings,
  } = useVideoTravelData(currentShotId || undefined, selectedProjectId);

  // Shot sort mode (shared between list and editor views for consistent navigation)
  const [shotSortMode, setShotSortModeState] = useState<'ordered' | 'newest' | 'oldest'>(
    projectUISettings?.shotSortMode || 'ordered'
  );

  const setShotSortMode = useCallback((mode: 'ordered' | 'newest' | 'oldest') => {
    setShotSortModeState(mode);
    updateProjectUISettings?.('project', { shotSortMode: mode });
  }, [updateProjectUISettings]);

  // Sync with project settings when they load
  useEffect(() => {
    if (projectUISettings?.shotSortMode && projectUISettings.shotSortMode !== shotSortMode) {
      setShotSortModeState(projectUISettings.shotSortMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync on external changes, not local state
  }, [projectUISettings?.shotSortMode]);

  // Hash-based deep linking (extracts hash, resolves project, manages grace period)
  const { hashShotId, hashLoadingGrace, initializingFromHash } = useHashDeepLink({
    currentShotId,
    setCurrentShotId,
    selectedProjectId,
    setSelectedProjectId,
    shots,
    shotsLoading,
    shotFromState,
    isNewlyCreatedShot,
  });

  // Shot resolution (selectedShot, shotToEdit, shouldShowEditor)
  const { selectedShot, shotToEdit, shouldShowEditor } = useSelectedShotResolution({
    currentShotId,
    shots,
    shotFromState,
    isNewlyCreatedShot,
    hashShotId,
    hashLoadingGrace,
    viaShotClick,
  });

  // URL sync (keeps hash in sync with selection - called after we have selectedShot)
  useUrlSync({
    selectedShot,
    shotsLoading,
    shots,
    shotFromState,
    viaShotClick,
    setCurrentShotId,
  });

  // Loading state (include projectUISettings to avoid sort-mode flash)
  const isLoading = shotsLoading || initializingFromHash || (!!selectedProjectId && projectUISettings === undefined);
  const showStableSkeleton = useStableSkeletonVisibility(isLoading);


  // Handle no project selected
  const [showProjectError, setShowProjectError] = useState(false);
  useEffect(() => {
    if (!selectedProjectId) {
      const t = setTimeout(() => setShowProjectError(true), 1500);
      return () => clearTimeout(t);
    }
    setShowProjectError(false);
  }, [selectedProjectId]);

  // Sync currentShotId with shotToEdit
  useEffect(() => {
    if (shotToEdit && currentShotId !== shotToEdit.id) {
      setCurrentShotId(shotToEdit.id);
    }
  }, [shotToEdit, currentShotId, setCurrentShotId]);

  // Clear shot on mount if not coming from shot click and no hash
  useEffect(() => {
    const hasHashShotId = !!location.hash?.replace('#', '');
    if (!viaShotClick && !hasHashShotId && currentShotId) {
      setCurrentShotId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Render ---

  // No project selected
  if (!selectedProjectId) {
    if (showProjectError) {
      return <div className="p-4 text-center text-muted-foreground">Please select a project first.</div>;
    }
    if (hashShotId) {
      return <LoadingSkeleton type="editor" />;
    }
    return <LoadingSkeleton type="grid" gridItemCount={6} />;
  }

  // Error loading shots
  if (shotsError) {
    return <div className="p-4">Error loading shots: {shotsError.message}</div>;
  }

  // Loading
  if (showStableSkeleton) {
    if (hashShotId) {
      return <LoadingSkeleton type="editor" />;
    }
    return <LoadingSkeleton type="grid" gridItemCount={6} />;
  }

  // Editor view
  if (shouldShowEditor) {
    if (shotToEdit) {
      return (
        <div className="w-full">
          <ShotEditorView
            shotToEdit={shotToEdit}
            selectedProjectId={selectedProjectId}
            isNewlyCreatedShot={isNewlyCreatedShot}
            shotFromState={shotFromState}
            shots={shots}
            availableLoras={availableLoras}
            shotSortMode={shotSortMode}
          />
        </div>
      );
    }

    // Loading or not found
    if (isNewlyCreatedShot || hashLoadingGrace) {
      return <ShotEditorLoading />;
    }

    return (
      <ShotEditorNotFound
        onBack={() => {
          setCurrentShotId(null);
          window.history.replaceState(null, '', location.pathname);
        }}
      />
    );
  }

  // List view
  return (
    <div className="w-full">
      <ShotListView
        shots={shots}
        selectedProjectId={selectedProjectId}
        projectAspectRatio={projectAspectRatio}
        refetchShots={refetchShots}
        projectUISettings={projectUISettings}
        updateProjectUISettings={updateProjectUISettings}
        uploadSettings={uploadSettings}
        shotSortMode={shotSortMode}
        setShotSortMode={setShotSortMode}
      />
    </div>
  );
};

export default VideoTravelToolPage;
