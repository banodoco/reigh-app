import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { AstridBridgeDataProvider } from '@/tools/video-editor/data/AstridBridgeDataProvider.ts';
import { RuntimeDataProvider } from '@/integrations/runtime/dataProvider.ts';
import { isAstridWorkspaceV1 } from '@/integrations/astrid/workspaceV1.ts';
import { resolveTimelineConfig } from '@/tools/video-editor/lib/config-utils.ts';
import type { AssetRegistry } from '@/tools/video-editor/types/index.ts';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl.ts';
import { ShotsContextProvider } from '@/shared/contexts/ShotsContext.tsx';
import { shotListLocation, shotLocation } from '@/shared/lib/tooling/toolRoutes.ts';
import { ShotListDisplay } from '../components/VideoGallery/ShotListDisplay.tsx';
import { ShotEditorView } from './ShotEditorView.tsx';
import type { Shot } from '@/domains/generation/types';
import {
  selectCanonicalShotOccurrences,
  selectCanonicalShotModels,
} from './localTimelineShotModel.ts';
import {
  createShotCompositionAdapter,
  type PreparedShotComposition,
  type ShotCompositionAdapter,
  type ShotCompositionPort,
} from '@/tools/video-editor/data/shotCompositionAdapter.ts';

type LocalTimelineShotBrowserProps = {
  projectSlug: string;
  projectId?: string;
  timelineRef: string;
  shotCompositionPort?: ShotCompositionPort;
  /** Reuse an already prepared canonical adapter from the parent editor. */
  shotCompositionAdapter?: ShotCompositionAdapter;
  /** Opens one canonical shot without changing the parent route. */
  shotRef?: string | null;
  onClose?: () => void;
  /** Receives the latest graph after an embedded shot edit is published. */
  onCanonicalCompositionPublished?: (composition: PreparedShotComposition) => void;
};

type LocalTimelineDocument = {
  registry: AssetRegistry;
  composition: Awaited<ReturnType<ReturnType<typeof createShotCompositionAdapter>['load']>>;
  compositionAdapter: ReturnType<typeof createShotCompositionAdapter>;
};

function useLocalTimelineDocument(
  projectSlug: string,
  projectId: string | undefined,
  timelineRef: string,
  shotCompositionPort?: ShotCompositionPort,
  shotCompositionAdapter?: ShotCompositionAdapter,
) {
  const provider = useMemo(() => {
    if (isAstridWorkspaceV1 && projectId) {
      return new RuntimeDataProvider({ projectId });
    }
    return new AstridBridgeDataProvider({
      projectSlug,
      timelineRef,
      timelineId: timelineRef,
    });
  }, [projectId, projectSlug, timelineRef]);
  const identityProjectId = projectId ?? projectSlug;
  const canonicalPort = shotCompositionPort ?? provider.shotComposition;
  const compositionAdapter = useMemo(
    () => shotCompositionAdapter ?? (canonicalPort ? createShotCompositionAdapter(canonicalPort) : null),
    [canonicalPort, shotCompositionAdapter],
  );

  return useQuery<LocalTimelineDocument>({
    queryKey: ['canonical-local-timeline-shot-browser', identityProjectId, timelineRef, shotCompositionPort, shotCompositionAdapter],
    queryFn: async () => {
      if (!compositionAdapter) {
        throw new Error('Canonical shot-composition provider is unavailable for this timeline.');
      }
      const [timeline, registry] = await Promise.all([
        provider.loadTimeline(timelineRef),
        provider.loadAssetRegistry(timelineRef),
      ]);
      // Resolve the registry through the same provider used by the editor so
      // managed media gets a bridge content URL when no thumbnail is stored.
      const resolved = await resolveTimelineConfig(
        timeline.config,
        registry,
        (file, entry, assetId) => provider.onResolve
          ? provider.onResolve({
            file,
            entry,
            assetId,
            timelineId: timelineRef,
          })
          : provider.resolveAssetUrl(file),
      );
      return {
        registry: {
          assets: Object.fromEntries(Object.entries(resolved.registry).map(([key, entry]) => [key, entry])),
        },
        composition: await compositionAdapter.load({ projectId: identityProjectId, parentDocumentId: timelineRef }),
        compositionAdapter,
      };
    },
  });
}

export function LocalTimelineShotBrowser({ projectSlug, projectId, timelineRef, shotCompositionPort, shotCompositionAdapter, shotRef, onClose, onCanonicalCompositionPublished }: LocalTimelineShotBrowserProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const identityProjectId = projectId ?? projectSlug;
  const documentQuery = useLocalTimelineDocument(projectSlug, projectId, timelineRef, shotCompositionPort, shotCompositionAdapter);
  const [compositionOverride, setCompositionOverride] = useState<PreparedShotComposition | null>(null);
  const loadedComposition = documentQuery.data?.composition;
  useEffect(() => {
    setCompositionOverride(null);
  }, [loadedComposition]);
  const composition = compositionOverride ?? loadedComposition;
  const shots = useMemo(
    () => selectCanonicalShotOccurrences(composition, documentQuery.data?.registry, identityProjectId),
    [composition, documentQuery.data?.registry, identityProjectId],
  );
  const shotModels = useMemo(
    () => selectCanonicalShotModels(composition, documentQuery.data?.registry, identityProjectId),
    [composition, documentQuery.data?.registry, identityProjectId],
  );
  const hashShotId = useMemo(() => {
    if (shotRef) return shotRef;
    const encoded = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    try {
      const decoded = decodeURIComponent(encoded).trim();
      return decoded || null;
    } catch {
      return null;
    }
  }, [location.hash, shotRef]);
  const shotRefOccurrenceId = useMemo(() => {
    if (!hashShotId) return null;
    const match = hashShotId.match(/\/occurrence\/([^/]+)$/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }, [hashShotId]);
  const selectedShot = useMemo(
    () => shots.find((shot) => shot.occurrenceId === hashShotId || shot.stableDeepLink === hashShotId || shot.occurrenceId === shotRefOccurrenceId),
    [hashShotId, shotRefOccurrenceId, shots],
  );
  const selectedShotModel = useMemo(
    () => selectedShot ? shotModels.find((shot) => shot.id === selectedShot.id) : undefined,
    [selectedShot, shotModels],
  );
  const handleCanonicalCompositionPublished = useCallback((nextComposition: PreparedShotComposition) => {
    setCompositionOverride(nextComposition);
    onCanonicalCompositionPublished?.(nextComposition);
  }, [onCanonicalCompositionPublished]);

  useEffect(() => {
    // A stale or malformed deep link should land safely on the overview once
    // the document is available. Keep the local project/timeline query intact.
    if (shotRef || documentQuery.isLoading || documentQuery.error || !location.hash || selectedShot) return;
    navigate(shotListLocation(location.pathname, location.search), { replace: true });
  }, [documentQuery.error, documentQuery.isLoading, location.hash, location.pathname, location.search, navigate, selectedShot, shotRef]);

  const selectShot = (shot: Shot & { stableDeepLink?: string }) => {
    if (!shot.stableDeepLink) return;
    // The hash is the canonical occurrence deep link, not a reusable shot id.
    navigate(shotLocation(location.pathname, location.search, shot.stableDeepLink), {
      state: {
        fromShotClick: true,
        shotData: { id: shot.stableDeepLink, name: shot.name, settings: {}, images: [] },
      },
    });
  };

  if (documentQuery.isLoading) {
    return <div className="p-6 text-center text-sm text-muted-foreground" role="status">Loading timeline shots…</div>;
  }
  if (documentQuery.error) {
    return (
      <div className="mx-auto flex max-w-xl items-center gap-2 p-6 text-sm text-destructive" role="alert">
        <AlertCircle className="h-4 w-4 shrink-0" />
        Unable to load this Astrid timeline: {documentQuery.error instanceof Error ? documentQuery.error.message : 'Unknown error'}
      </div>
    );
  }
  if (shots.length === 0) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-sm text-muted-foreground">
        This timeline has no document shot groups yet.
      </div>
    );
  }

  const shotsContext = {
    shots: shotModels,
    isLoading: false,
    error: null,
    refetchShots: () => undefined,
    allImagesCount: shotModels.reduce((total, shot) => total + (shot.images?.length ?? 0), 0),
    noShotImagesCount: 0,
  };

  return (
    <ShotsContextProvider value={shotsContext}>
      {selectedShot && selectedShotModel ? (
        <ShotEditorView
          shotToEdit={selectedShotModel}
          canonicalOccurrence={selectedShotModel}
          canonicalShotComposition={documentQuery.data?.compositionAdapter}
          canonicalComposition={composition}
          selectedProjectId={projectSlug}
          isNewlyCreatedShot={false}
          shotFromState={undefined}
          shots={shotModels}
          availableLoras={[]}
          shotSortMode="ordered"
          onClose={onClose}
          onCanonicalCompositionPublished={handleCanonicalCompositionPublished}
        />
      ) : (
        <section className="mx-auto w-full max-w-7xl" aria-label="Timeline shots">
          <div className="flex items-baseline justify-between gap-3 px-4 pt-5">
            <div>
              <h1 className="text-lg font-semibold">Timeline shots</h1>
              <p className="text-xs text-muted-foreground">Astrid document · {shotModels.length} shot{shotModels.length === 1 ? '' : 's'}</p>
            </div>
            <span className="rounded bg-muted px-2 py-1 text-[10px] text-muted-foreground">Local timeline</span>
          </div>
          <ShotListDisplay
            readOnly
            projectId={identityProjectId}
            shots={shotModels}
            onSelectShot={selectShot}
            sortMode="ordered"
          />
        </section>
      )}
    </ShotsContextProvider>
  );
}

export function localTimelineMediaUrl(projectSlug: string, mediaId: string): string {
  return bridgeMediaUrl(projectSlug, mediaId);
}
