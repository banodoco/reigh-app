import React, { useEffect, useMemo } from 'react';
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
import { ShotListDisplay } from '../components/VideoGallery/ShotListDisplay.tsx';
import { ShotEditorView } from './ShotEditorView.tsx';
import type { Shot } from '@/domains/generation/types';
import {
  selectCanonicalShotOccurrences,
  selectCanonicalShotModels,
} from './localTimelineShotModel.ts';
import {
  createShotCompositionAdapter,
  type ShotCompositionPort,
} from '@/tools/video-editor/data/shotCompositionAdapter.ts';

type LocalTimelineShotBrowserProps = {
  projectSlug: string;
  projectId?: string;
  timelineRef: string;
  shotCompositionPort?: ShotCompositionPort;
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
    () => canonicalPort ? createShotCompositionAdapter(canonicalPort) : null,
    [canonicalPort],
  );

  return useQuery<LocalTimelineDocument>({
    queryKey: ['canonical-local-timeline-shot-browser', identityProjectId, timelineRef, shotCompositionPort],
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

export function LocalTimelineShotBrowser({ projectSlug, projectId, timelineRef, shotCompositionPort }: LocalTimelineShotBrowserProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const identityProjectId = projectId ?? projectSlug;
  const documentQuery = useLocalTimelineDocument(projectSlug, projectId, timelineRef, shotCompositionPort);
  const shots = useMemo(
    () => selectCanonicalShotOccurrences(documentQuery.data?.composition, documentQuery.data?.registry, identityProjectId),
    [documentQuery.data, identityProjectId],
  );
  const shotModels = useMemo(
    () => selectCanonicalShotModels(documentQuery.data?.composition, documentQuery.data?.registry, identityProjectId),
    [documentQuery.data, identityProjectId],
  );
  const hashShotId = useMemo(() => {
    const encoded = location.hash.startsWith('#') ? location.hash.slice(1) : location.hash;
    try {
      const decoded = decodeURIComponent(encoded).trim();
      return decoded || null;
    } catch {
      return null;
    }
  }, [location.hash]);
  const selectedShot = useMemo(
    () => shots.find((shot) => shot.occurrenceId === hashShotId || shot.stableDeepLink === hashShotId),
    [hashShotId, shots],
  );
  const selectedShotModel = useMemo(
    () => selectedShot ? shotModels.find((shot) => shot.id === selectedShot.id) : undefined,
    [selectedShot, shotModels],
  );

  useEffect(() => {
    // A stale or malformed deep link should land safely on the overview once
    // the document is available. Keep the local project/timeline query intact.
    if (documentQuery.isLoading || documentQuery.error || !location.hash || selectedShot) return;
    navigate({ pathname: location.pathname, search: location.search, hash: '' }, { replace: true });
  }, [documentQuery.error, documentQuery.isLoading, location.hash, location.pathname, location.search, navigate, selectedShot]);

  const selectShot = (shot: Shot & { stableDeepLink?: string }) => {
    if (!shot.stableDeepLink) return;
    // The hash is the canonical occurrence deep link, not a reusable shot id.
    navigate({
      pathname: location.pathname,
      search: location.search,
      hash: encodeURIComponent(shot.stableDeepLink),
    }, {
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
          selectedProjectId={projectSlug}
          isNewlyCreatedShot={false}
          shotFromState={undefined}
          shots={shotModels}
          availableLoras={[]}
          shotSortMode="ordered"
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
