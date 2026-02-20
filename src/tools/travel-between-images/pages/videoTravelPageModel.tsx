import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { ShotListView } from './ShotListView';
import { ShotEditorView, ShotEditorLoading, ShotEditorNotFound } from './ShotEditorView';

export type ShotEditorViewProps = React.ComponentProps<typeof ShotEditorView>;
export type ShotListViewProps = React.ComponentProps<typeof ShotListView>;
export type ShotSortMode = 'ordered' | 'newest' | 'oldest';

interface VideoTravelContentProps {
  selectedProjectId: string | null;
  showProjectError: boolean;
  hashShotId: string | null;
  shotsError: Error | null;
  showStableSkeleton: boolean;
  shouldShowEditor: boolean;
  shotToEdit: ShotEditorViewProps['shotToEdit'] | undefined;
  isNewlyCreatedShot: boolean;
  hashLoadingGrace: boolean;
  locationPathname: string;
  setCurrentShotId: (shotId: string | null) => void;
  shotEditorProps: Omit<ShotEditorViewProps, 'shotToEdit'>;
  shotListProps: ShotListViewProps;
}

export function VideoTravelContent({
  selectedProjectId,
  showProjectError,
  hashShotId,
  shotsError,
  showStableSkeleton,
  shouldShowEditor,
  shotToEdit,
  isNewlyCreatedShot,
  hashLoadingGrace,
  locationPathname,
  setCurrentShotId,
  shotEditorProps,
  shotListProps,
}: VideoTravelContentProps) {
  if (!selectedProjectId) {
    if (showProjectError) {
      return <div className="p-4 text-center text-muted-foreground">Please select a project first.</div>;
    }
    if (hashShotId) return <LoadingSkeleton type="editor" />;
    return <LoadingSkeleton type="grid" gridItemCount={6} />;
  }

  if (shotsError) {
    return <div className="p-4">Error loading shots: {shotsError.message}</div>;
  }

  if (showStableSkeleton) {
    if (hashShotId) return <LoadingSkeleton type="editor" />;
    return <LoadingSkeleton type="grid" gridItemCount={6} />;
  }

  if (shouldShowEditor) {
    if (shotToEdit) {
      return (
        <div className="w-full">
          <ShotEditorView shotToEdit={shotToEdit} {...shotEditorProps} />
        </div>
      );
    }

    if (isNewlyCreatedShot || hashLoadingGrace) {
      return <ShotEditorLoading />;
    }

    return (
      <ShotEditorNotFound
        onBack={() => {
          setCurrentShotId(null);
          window.history.replaceState(null, '', locationPathname);
        }}
      />
    );
  }

  return (
    <div className="w-full">
      <ShotListView {...shotListProps} />
    </div>
  );
}

export function useScrollToTopOnHashExit(hash: string) {
  const prevHashRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const hasHash = hash && hash.length > 1;
    const hadHash = prevHashRef.current !== null && prevHashRef.current.length > 1;

    if (!hasHash && (prevHashRef.current === null || hadHash)) {
      window.scrollTo(0, 0);
      window.dispatchEvent(new CustomEvent('app:scrollToTop', { detail: { behavior: 'auto' } }));
    }

    prevHashRef.current = hash;
  }, [hash]);
}

export function useShotSortModeState(
  initialSortMode: ShotSortMode | undefined,
  updateProjectUISettings: ShotListViewProps['updateProjectUISettings'],
) {
  const [shotSortMode, setShotSortModeState] = useState<ShotSortMode>(
    initialSortMode || 'ordered'
  );

  const setShotSortMode = useCallback((mode: ShotSortMode) => {
    setShotSortModeState(mode);
    updateProjectUISettings?.('project', { shotSortMode: mode });
  }, [updateProjectUISettings]);

  useEffect(() => {
    if (initialSortMode && initialSortMode !== shotSortMode) {
      setShotSortModeState(initialSortMode);
    }
  }, [initialSortMode, shotSortMode]);

  return { shotSortMode, setShotSortMode };
}

export function useProjectErrorTimer(selectedProjectId: string | null) {
  const [showProjectError, setShowProjectError] = useState(false);

  useEffect(() => {
    if (!selectedProjectId) {
      const timer = setTimeout(() => setShowProjectError(true), 1500);
      return () => clearTimeout(timer);
    }

    setShowProjectError(false);
  }, [selectedProjectId]);

  return showProjectError;
}

export function useSyncCurrentShotId(
  shotToEdit: ShotEditorViewProps['shotToEdit'] | undefined,
  currentShotId: string | null,
  setCurrentShotId: (shotId: string | null) => void,
) {
  useEffect(() => {
    if (shotToEdit && currentShotId !== shotToEdit.id) {
      setCurrentShotId(shotToEdit.id);
    }
  }, [shotToEdit, currentShotId, setCurrentShotId]);
}

export function useResetShotOnMount(
  hash: string,
  viaShotClick: boolean,
  currentShotId: string | null,
  setCurrentShotId: (shotId: string | null) => void,
) {
  useEffect(() => {
    const hasHashShotId = !!hash?.replace('#', '');
    if (!viaShotClick && !hasHashShotId && currentShotId) {
      setCurrentShotId(null);
    }
  }, [currentShotId, hash, setCurrentShotId, viaShotClick]);
}
