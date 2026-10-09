import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MemoryRouter, useInRouterContext } from 'react-router-dom';
import { EditorRuntimeProvider, type EditorRuntimeProviderProps } from '@/tools/video-editor/contexts/EditorRuntimeProvider.tsx';
import { useResolvedEffectCatalog } from '@/tools/video-editor/hooks/useEffectResources.ts';
import { useResolvedSequenceComponentCatalog } from '@/tools/video-editor/hooks/useSequenceResources.ts';
import { INSTALLED_TIMELINE_SERVICE_HOOKS } from '@/tools/video-editor/runtime/installedTimelineHostServiceHooks.ts';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
import type { VideoEditorEffectCatalog } from '@/tools/video-editor/hooks/useEffectResources.ts';
import type {
  VideoEditorAssetResolver,
  VideoEditorExporter,
  VideoEditorHostContext,
} from '@/tools/video-editor/lib/browser-runtime.ts';
import { createLocalAssetResolver } from '@/tools/video-editor/lib/browser-runtime.ts';
import type { ExtensionDiagnostic, ReighExtension } from '@reigh/editor-sdk';
import { getExtensionSmokeExtension } from '@/sdk/smoke/extensionSmoke';
import { useExtensionLoaderWiring } from '@/tools/video-editor/runtime/useExtensionLoaderWiring';
import type { ExtensionStateRepository } from '@/tools/video-editor/runtime/extensionStateRepository';
import type { BundleContentStore } from '@/tools/video-editor/runtime/useExtensionLoaderWiring';
import { VIDEO_EDITOR_SCOPED_SERVICES_CONTRACT, assertVideoEditorScope, videoEditorScopeKey, type VideoEditorScopedServices } from './scopedServices.ts';
import type { SaveStatus } from '../hooks/useTimelinePersistence.ts';
import { useOwnedResourceDisposal } from '../hooks/useOwnedResourceDisposal.ts';
import { INSTALLED_ASTRID_ELEMENT_HOST } from '@/tools/video-editor/runtime/astrid-element-components.tsx';

export interface BrowserVideoEditorProviderProps {
  dataProvider: DataProvider;
  hostServices?: VideoEditorScopedServices;
  onSaveStatusChange?: (status: SaveStatus) => void;
  timelineId: string;
  timelineName?: string | null;
  userId?: string | null;
  effectCatalog?: VideoEditorEffectCatalog | null;
  assetResolver?: VideoEditorAssetResolver | null;
  exporter?: VideoEditorExporter | null;
  hostContext?: VideoEditorHostContext | null;
  extensions?: readonly ReighExtension[];
  /** M14: Optional extension state repository for installed pack resolution. */
  repository?: ExtensionStateRepository | null;
  /** M14: Optional bundle content store for installed pack bytes (IndexedDB). */
  bundleStore?: BundleContentStore | null;
  /**
   * M5: Monotonic refresh key forwarded to useExtensionLoaderWiring.
   * Increment after persistence writes (enable/disable, settings save) to
   * force re-resolution of extensions, diagnostics, and package-state
   * inventory without a page refresh.
   */
  refreshKey?: number;
  queryClient?: QueryClient;
  initialEntries?: string[];
  /** T22: Provider-owned timeline-overlay feature flag. Explicitly defaults
   *  to false; hosts opt in by supplying `true`. */
  timelineOverlaysEnabled?: boolean;
  children: ReactNode;
}

function createDefaultQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

/** Installed browser adapter: private catalogs stay outside the shared runtime assembly. */
function BrowserRuntimeWithCatalogs({effectCatalog, userId = null, ...props}: EditorRuntimeProviderProps) {
  const resolvedEffectCatalog = useResolvedEffectCatalog(userId, effectCatalog);
  const sequenceComponentCatalog = useResolvedSequenceComponentCatalog(userId);
  return (
    <EditorRuntimeProvider
      {...props}
      userId={userId}
      effectCatalog={resolvedEffectCatalog}
      sequenceComponentCatalog={sequenceComponentCatalog}
      timelineServices={props.hostServices?.timelineServices ?? INSTALLED_TIMELINE_SERVICE_HOOKS}
    />
  );
}

/**
 * @publicContract
 * Browser-only runtime provider for custom shells that use the supported
 * public hooks instead of the stock editor chrome.
 */
export function BrowserVideoEditorProvider(props: BrowserVideoEditorProviderProps) {
  // A service/provider/repository change is a new authority. Remount the
  // existing assembly and loader together so neither can reuse old scope state.
  const authority = useRef({
    dataProvider: props.dataProvider, repository: props.repository,
    bundleStore: props.bundleStore, generation: 0,
  });
  if (authority.current.dataProvider !== props.dataProvider
    || authority.current.repository !== props.repository
    || authority.current.bundleStore !== props.bundleStore) {
    authority.current = {
      dataProvider: props.dataProvider, repository: props.repository,
      bundleStore: props.bundleStore, generation: authority.current.generation + 1,
    };
  }
  const scopeKey = props.hostServices
    ? videoEditorScopeKey(props.hostServices.scope) : JSON.stringify([props.timelineId]);
  return <BrowserVideoEditorProviderInstance key={JSON.stringify([scopeKey, props.userId ?? null, authority.current.generation])} {...props} />;
}

function BrowserVideoEditorProviderInstance({
  dataProvider,
  hostServices,
  onSaveStatusChange,
  timelineId,
  timelineName,
  userId = null,
  effectCatalog,
  assetResolver = null,
  exporter = null,
  hostContext = null,
  extensions,
  repository: explicitRepository,
  bundleStore: explicitBundleStore,
  refreshKey,
  queryClient,
  initialEntries,
  timelineOverlaysEnabled = false,
  children,
}: BrowserVideoEditorProviderProps) {
  if (hostServices) {
    if (hostServices.contract !== VIDEO_EDITOR_SCOPED_SERVICES_CONTRACT) {
      throw new Error('Unsupported Video Editor scoped service contract.');
    }
    assertVideoEditorScope(hostServices.scope, timelineId);
    if (hostContext?.projectId && hostContext.projectId !== hostServices.scope.projectId) {
      throw new Error('Video Editor hostContext projectId must match the captured service scope.');
    }
  }
  const [ownedQueryClient] = useState(createDefaultQueryClient);
  useOwnedResourceDisposal(ownedQueryClient, (client) => client.clear());
  const hasHostRouter = useInRouterContext();

  // ---- M5: Internal refresh key for extension re-resolution ----------------
  // When refreshKey prop is provided it takes precedence; otherwise we manage
  // an internal counter that gets incremented by triggerExtensionRefresh.
  const [internalRefreshKey, setInternalRefreshKey] = useState(0);
  const effectiveRefreshKey = refreshKey ?? internalRefreshKey;

  const triggerExtensionRefresh = useCallback(() => {
    if (refreshKey !== undefined) {
      // External refreshKey: the caller owns refresh. We still provide a
      // no-op trigger so the manager can call it without checking.
      return;
    }
    setInternalRefreshKey((prev) => prev + 1);
  }, [refreshKey]);

  // ---- M2: Derive effective repository / bundleStore from DataProvider when
  //        explicit props are not supplied ----------------------------------

  const [derivedPersistence, setDerivedPersistence] = useState<{
    provider: DataProvider; userId: string; timelineId: string;
    repository: ExtensionStateRepository | null;
    bundleStore: BundleContentStore | null;
  } | null>(null);

  useEffect(() => {
    if (explicitRepository !== undefined || !userId || !dataProvider.createExtensionPersistenceService) return;
    const diagnostics: ExtensionDiagnostic[] = [];
    const service = dataProvider.createExtensionPersistenceService({ userId, timelineId }, diagnostics);
    let cancelled = false;
    // Initialization and cleanup share one terminal disposal, even if init
    // resolves after this instance has changed scope or been unmounted.
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      void service.dispose().catch(() => {});
    };
    void service.initialize().then(() => {
      if (cancelled) return;
      const repository = service.stateRepository ?? null;
      const getBundleContent = repository && 'getBundleContent' in repository && typeof repository.getBundleContent === 'function'
        ? repository.getBundleContent : null;
      const bundleStore = getBundleContent
        ? { getBundleContent: (ref: string) => getBundleContent.call(repository, ref) } : null;
      setDerivedPersistence({ provider: dataProvider, userId, timelineId, repository, bundleStore });
    }).catch(() => {
      if (!cancelled) setDerivedPersistence(null);
    });
    return () => { cancelled = true; dispose(); };
  }, [explicitRepository, userId, timelineId, dataProvider]);

  const currentPersistence = derivedPersistence?.provider === dataProvider
    && derivedPersistence.userId === userId && derivedPersistence.timelineId === timelineId
    ? derivedPersistence : null;
  const effectiveRepository = explicitRepository !== undefined ? explicitRepository : currentPersistence?.repository ?? null;
  const effectiveBundleStore = explicitBundleStore !== undefined ? explicitBundleStore : currentPersistence?.bundleStore ?? null;

  const effectiveAssetResolver = assetResolver ?? createLocalAssetResolver();

  // ---- Smoke extension wiring (prepend when ?extensionSmoke=1) -------------
  const effectiveDirectExtensions = useMemo<readonly ReighExtension[] | undefined>(() => {
    const smokeExt = import.meta.env.DEV
      ? getExtensionSmokeExtension(window.location.search)
      : null;
    if (!smokeExt) {
      return extensions;
    }
    if (!extensions || extensions.length === 0) {
      return [smokeExt];
    }
    return [smokeExt, ...extensions];
  }, [extensions]);

  // ---- M14: extension loader wiring (host-owned) --------------------------
  const {
    resolvedExtensions,
    isResolving: _loaderIsResolving,
    packageStateEntries,
  } = useExtensionLoaderWiring({
    directExtensions: effectiveDirectExtensions,
    repository: effectiveRepository ?? null,
    bundleStore: effectiveBundleStore ?? null,
    refreshKey: effectiveRefreshKey,
  });

  const runtime = (
    <BrowserRuntimeWithCatalogs
      hostServices={hostServices}
      onSaveStatusChange={onSaveStatusChange}
      astridElementHost={INSTALLED_ASTRID_ELEMENT_HOST}
      dataProvider={dataProvider}
      timelineId={timelineId}
      timelineName={timelineName}
      userId={userId}
      effectCatalog={effectCatalog}
      runtime={{ assetResolver: effectiveAssetResolver, exporter, hostContext }}
      extensions={resolvedExtensions}
      packageStateEntries={packageStateEntries}
      extensionStateRepository={effectiveRepository ?? null}
      triggerExtensionRefresh={triggerExtensionRefresh}
      timelineOverlaysEnabled={timelineOverlaysEnabled}
    >
      {children}
    </BrowserRuntimeWithCatalogs>
  );

  return (
    <QueryClientProvider client={queryClient ?? ownedQueryClient}>
      {hasHostRouter
        ? runtime
        : (
            <MemoryRouter initialEntries={initialEntries ?? ['/tools/video-editor']}>
              {runtime}
            </MemoryRouter>
          )}
    </QueryClientProvider>
  );
}
