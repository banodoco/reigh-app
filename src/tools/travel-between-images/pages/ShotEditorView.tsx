import {
  useState,
  useEffect,
  useRef,
  useCallback,
  Suspense
} from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shot } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { PageFadeIn } from '@/shared/components/transitions';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import { useUpdateShotName } from '@/shared/hooks/useShots';
import { useShotImages, usePrimeShotImagesCache } from '@/shared/hooks/useShotImages';
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';
import { useProjectVideoCountsCache } from '@/shared/hooks/useProjectVideoCountsCache';
import { useProjectGenerationModesCache } from '@/shared/hooks/useProjectGenerationModesCache';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { useVideoGalleryPreloader } from '@/shared/hooks/useVideoGalleryPreloader';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';
import { ShotSettingsEditor } from '../components/ShotEditor';
import { VideoTravelSettingsProvider } from '../providers';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { VideoTravelFloatingOverlay } from '../components/VideoTravelFloatingOverlay';
import {
  useShotSettings,
  useVideoTravelSettingsHandlers,
  useStickyHeader,
  useNavigationState,
  useOperationTracking,
} from '../hooks';

interface ShotEditorViewProps {
  /** The shot to edit */
  shotToEdit: Shot;
  /** Selected project ID */
  selectedProjectId: string;
  /** Whether this is a newly created shot */
  isNewlyCreatedShot: boolean;
  /** Shot data from navigation state (for optimistic updates) */
  shotFromState: Shot | undefined;
  /** Array of all shots (for navigation) */
  shots: Shot[] | undefined;
  /** Available LoRAs */
  availableLoras: LoraModel[];
  /** Sort mode for shot navigation */
  shotSortMode?: 'ordered' | 'newest' | 'oldest';
}

/**
 * Shot editor view - wraps ShotSettingsEditor with all necessary setup.
 * Handles settings, navigation, and state coordination.
 */
export function ShotEditorView({
  shotToEdit,
  selectedProjectId,
  isNewlyCreatedShot,
  shotFromState,
  shots,
  availableLoras,
  shotSortMode = 'ordered',
}: ShotEditorViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile();

  const { currentShotId, setCurrentShotId } = useCurrentShot();
  const { navigateToPreviousShot, navigateToNextShot } = useShotNavigation();
  const updateShotNameMutation = useUpdateShotName();
  const invalidateGenerations = useInvalidateGenerations();

  // Get generation location settings to auto-disable turbo mode when not in cloud
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudGenerationEnabled = generationMethods.inCloud;

  // Project caches
  const { getShotVideoCount, getFinalVideoCount, invalidateOnVideoChanges } = useProjectVideoCountsCache(selectedProjectId);
  const { getShotGenerationMode, updateShotMode } = useProjectGenerationModesCache(selectedProjectId);

  // Shot settings
  const shotSettings = useShotSettings(shotToEdit.id, selectedProjectId);
  const shotSettingsRef = useRef(shotSettings);
  shotSettingsRef.current = shotSettings;

  // Settings handlers
  const {
    noOpCallback,
    handlePairConfigChange,
  } = useVideoTravelSettingsHandlers({
    shotSettingsRef,
    currentShotId: shotToEdit.id,
    selectedShot: shotToEdit,
    updateShotMode,
  });

  // Dimension state (local, not persisted)
  const [dimensionSource, setDimensionSource] = useState<'project' | 'firstImage' | 'custom'>('firstImage');
  const [customWidth, setCustomWidth] = useState<number | undefined>(undefined);
  const [customHeight, setCustomHeight] = useState<number | undefined>(undefined);

  const handleDimensionSourceChange = useCallback((source: 'project' | 'firstImage' | 'custom') => {
    setDimensionSource(source);
  }, []);

  const handleCustomWidthChange = useCallback((width?: number) => {
    setCustomWidth(width);
  }, []);

  const handleCustomHeightChange = useCallback((height?: number) => {
    setCustomHeight(height);
  }, []);

  // Extract settings values
  const {
    turboMode = false,
    advancedMode = false,
  } = shotSettings.settings || {};

  // Auto-disable turbo mode when cloud generation is disabled
  useEffect(() => {
    if (shotSettings.status !== 'ready' || shotSettings.shotId !== shotToEdit.id) {
      return;
    }
    if (!isCloudGenerationEnabled && turboMode) {
      shotSettingsRef.current.updateField('turboMode', false);
    }
  }, [isCloudGenerationEnabled, turboMode, shotSettings.status, shotSettings.shotId, shotToEdit.id]);

  // Auto-disable advanced mode when turbo mode is on
  useEffect(() => {
    if (shotSettings.status !== 'ready' || shotSettings.shotId !== shotToEdit.id) {
      return;
    }
    if (turboMode && advancedMode) {
      shotSettingsRef.current.updateFields({
        advancedMode: false,
        motionMode: 'basic'
      });
    }
  }, [turboMode, advancedMode, shotSettings.status, shotSettings.shotId, shotToEdit.id]);

  // Navigation state
  const { sortedShots, hasPrevious, hasNext } = useNavigationState({
    shots,
    shotSortMode,
    selectedShot: shotToEdit,
  });

  // Video gallery thumbnail preloader
  useVideoGalleryPreloader({
    selectedShot: shotToEdit,
    shouldShowShotEditor: true,
  });

  // Operation tracking
  const {
    isShotOperationInProgress,
    isDraggingInTimeline,
    setIsDraggingInTimeline,
    signalShotOperation,
  } = useOperationTracking();

  // Full image data for editor
  const contextImages = shotToEdit.images || [];
  usePrimeShotImagesCache(shotToEdit.id, contextImages);

  const fullImagesQuery = useShotImages(
    shotToEdit.id,
    { disableRefetch: isShotOperationInProgress || isDraggingInTimeline }
  );

  // Sticky header
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const [headerReady, setHeaderReady] = useState(false);
  const headerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    headerContainerRef.current = node;
    setHeaderReady(!!node);
  }, []);

  const nameClickRef = useRef<(() => void) | null>(null);

  const stickyHeader = useStickyHeader({
    headerRef: headerContainerRef,
    isMobile,
    enabled: headerReady
  });

  // Pane widths for floating overlay
  const {
    isShotsPaneLocked,
    shotsPaneWidth,
    isTasksPaneLocked,
    tasksPaneWidth
  } = usePanes();

  // Navigation handlers
  const handleBackToShotList = useCallback(() => {
    setCurrentShotId(null);
    navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
  }, [setCurrentShotId, navigate, location.pathname]);

  const handlePreviousShot = useCallback(() => {
    if (sortedShots && shotToEdit) {
      navigateToPreviousShot(sortedShots, shotToEdit, { scrollToTop: true });
    }
  }, [sortedShots, shotToEdit, navigateToPreviousShot]);

  const handleNextShot = useCallback(() => {
    if (sortedShots && shotToEdit) {
      navigateToNextShot(sortedShots, shotToEdit, { scrollToTop: true });
    }
  }, [sortedShots, shotToEdit, navigateToNextShot]);

  const handlePreviousShotNoScroll = useCallback(() => {
    if (sortedShots && shotToEdit) {
      navigateToPreviousShot(sortedShots, shotToEdit, { scrollToTop: false });
    }
  }, [sortedShots, shotToEdit, navigateToPreviousShot]);

  const handleNextShotNoScroll = useCallback(() => {
    if (sortedShots && shotToEdit) {
      navigateToNextShot(sortedShots, shotToEdit, { scrollToTop: false });
    }
  }, [sortedShots, shotToEdit, navigateToNextShot]);

  const handleUpdateShotName = useCallback((newName: string) => {
    updateShotNameMutation.mutate({
      shotId: shotToEdit.id,
      newName: newName,
      projectId: selectedProjectId,
    });
  }, [shotToEdit.id, selectedProjectId, updateShotNameMutation]);

  const handleShotImagesUpdate = useCallback(async () => {
    invalidateGenerations(shotToEdit.id, {
      reason: 'shot-operation-complete',
      scope: 'all',
      includeShots: true,
      projectId: selectedProjectId
    });
    signalShotOperation();
  }, [selectedProjectId, shotToEdit.id, invalidateGenerations, signalShotOperation]);

  const handleFloatingHeaderNameClick = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => {
      if (nameClickRef.current) {
        nameClickRef.current();
      }
    }, 600);
  }, []);

  return (
    <>
      <div className="px-4 max-w-7xl mx-auto pt-4">
        <Suspense fallback={<LoadingSkeleton type="editor" />}>
          <PageFadeIn>
            <VideoTravelSettingsProvider
              projectId={selectedProjectId}
              shotId={shotToEdit.id}
              selectedShot={shotToEdit}
              availableLoras={availableLoras}
              updateShotMode={updateShotMode}
            >
              <ShotSettingsEditor
                // Core identifiers
                selectedShotId={shotToEdit.id}
                projectId={selectedProjectId}
                optimisticShotData={isNewlyCreatedShot ? shotFromState : undefined}
                // Callbacks
                onShotImagesUpdate={handleShotImagesUpdate}
                onBack={handleBackToShotList}
                onPairConfigChange={handlePairConfigChange}
                onGenerateAllSegments={noOpCallback}
                // Dimension settings
                dimensionSource={dimensionSource}
                onDimensionSourceChange={handleDimensionSourceChange}
                customWidth={customWidth}
                onCustomWidthChange={handleCustomWidthChange}
                customHeight={customHeight}
                onCustomHeightChange={handleCustomHeightChange}
                // Navigation
                onPreviousShot={handlePreviousShot}
                onNextShot={handleNextShot}
                onPreviousShotNoScroll={handlePreviousShotNoScroll}
                onNextShotNoScroll={handleNextShotNoScroll}
                hasPrevious={hasPrevious}
                hasNext={hasNext}
                onUpdateShotName={handleUpdateShotName}
                // Loading and cache
                getShotVideoCount={getShotVideoCount}
                getFinalVideoCount={getFinalVideoCount}
                invalidateVideoCountsCache={invalidateOnVideoChanges}
                // UI coordination
                onDragStateChange={setIsDraggingInTimeline}
                headerContainerRef={headerCallbackRef}
                nameClickRef={nameClickRef}
                isSticky={stickyHeader.isSticky}
              />
            </VideoTravelSettingsProvider>
          </PageFadeIn>
        </Suspense>
      </div>

      {/* Floating sticky header */}
      <VideoTravelFloatingOverlay
        sticky={{
          shouldShowShotEditor: true,
          stickyHeader,
          shotToEdit,
          isMobile,
          isShotsPaneLocked,
          shotsPaneWidth,
          isTasksPaneLocked,
          tasksPaneWidth,
          hasPrevious,
          hasNext,
          onPreviousShot: handlePreviousShotNoScroll,
          onNextShot: handleNextShotNoScroll,
          onBackToShotList: handleBackToShotList,
          onFloatingHeaderNameClick: handleFloatingHeaderNameClick,
        }}
      />
    </>
  );
}

/**
 * Loading state shown while waiting for shot data.
 */
export function ShotEditorLoading() {
  return (
    <div className="px-4 max-w-7xl mx-auto pt-4">
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading shot...</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Error state shown when shot is not found.
 */
export function ShotEditorNotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="px-4 max-w-7xl mx-auto pt-4">
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Shot not found</p>
          <Button onClick={onBack} variant="outline" size="sm">
            Back to Shots
          </Button>
        </div>
      </div>
    </div>
  );
}
