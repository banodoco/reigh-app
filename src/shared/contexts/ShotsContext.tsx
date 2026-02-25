import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useListShots, useProjectImageStats } from '@/shared/hooks/shots';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Shot } from '@/domains/generation/types';

interface ShotsContextType {
  shots: Shot[] | undefined;
  isLoading: boolean;
  error: Error | null;
  refetchShots: () => void;
  // Stats for SHOT_FILTER.ALL and SHOT_FILTER.NO_SHOT filters
  allImagesCount?: number;
  noShotImagesCount?: number;
}

const ShotsContext = createContext<ShotsContextType | undefined>(undefined);

interface ShotsProviderProps {
  children: ReactNode;
}

export const ShotsProvider: React.FC<ShotsProviderProps> = ({ children }) => {
  const { selectedProjectId } = useProject();

  // Track previous project ID to detect project switches
  const prevProjectIdRef = React.useRef<string | null>(null);
  const [isProjectTransitioning, setIsProjectTransitioning] = React.useState(false);

  // Detect project switch and set transitioning state
  React.useEffect(() => {
    if (prevProjectIdRef.current !== null && prevProjectIdRef.current !== selectedProjectId) {
      setIsProjectTransitioning(true);
    }
    prevProjectIdRef.current = selectedProjectId;
  }, [selectedProjectId]);

  // Load all images per shot (0 = unlimited)
  // Previously limited to 2 on mobile for performance, but this broke expand/collapse UI
  const maxImagesPerShot = 0;

  const { data: shots, isLoading: isShotsLoading, isFetching: isShotsFetching, error: shotsError, refetch } = useListShots(selectedProjectId, { maxImagesPerShot });

  // Load project-wide image stats
  const { data: projectStats, isLoading: isStatsLoading } = useProjectImageStats(selectedProjectId);

  // Clear transitioning state when new shots data arrives
  // Use isFetching (not isLoading) because placeholderData keeps isLoading false during refetches
  React.useEffect(() => {
    if (isProjectTransitioning && !isShotsFetching && shots !== undefined) {
      setIsProjectTransitioning(false);
    }
  }, [isProjectTransitioning, isShotsFetching, shots]);

  // Show loading during transition or actual loading
  const isLoading = isShotsLoading || isStatsLoading || isProjectTransitioning;
  const error = shotsError;

  // Return undefined for shots during transition to force skeleton display
  // This prevents showing stale data from a previously cached project
  const effectiveShots = isProjectTransitioning ? undefined : shots;

  // Memoize context value to prevent unnecessary re-renders of consumers
  const value = useMemo<ShotsContextType>(() => ({
    shots: effectiveShots,
    isLoading,
    error,
    refetchShots: refetch,
    allImagesCount: projectStats?.allCount,
    noShotImagesCount: projectStats?.noShotCount,
  }), [effectiveShots, isLoading, error, refetch, projectStats]);

  return (
    <ShotsContext.Provider value={value}>
      {children}
    </ShotsContext.Provider>
  );
};

export const useShots = (): ShotsContextType => {
  const context = useContext(ShotsContext);
  if (context === undefined) {
    throw new Error('useShots must be used within a ShotsProvider');
  }
  return context;
}; 