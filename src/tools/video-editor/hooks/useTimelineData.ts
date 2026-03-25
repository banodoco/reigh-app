import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TimelineRow } from '@xzdarcy/timeline-engine';
import { getTrackById } from '@/tools/video-editor/lib/editor-utils';
import { buildTrackClipOrder } from '@/tools/video-editor/lib/coordinate-utils';
import { getClipDurationInFrames, getConfigSignature, parseResolution, secondsToFrames } from '@/tools/video-editor/lib/config-utils';
import { serializeForDisk } from '@/tools/video-editor/lib/serialize';
import {
  buildTimelineData,
  configToRows,
  preserveUploadingClips,
  rowsToConfig,
  loadTimelineJsonFromProvider,
  type ClipMeta,
  type ClipOrderMap,
  type TimelineData,
} from '@/tools/video-editor/lib/timeline-data';
import { useClientRender } from '@/tools/video-editor/hooks/useClientRender';
import { useEditorSettings } from '@/tools/video-editor/settings/useEditorSettings';
import { assetRegistryQueryKey, timelineQueryKey } from '@/tools/video-editor/hooks/useTimeline';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/DataProviderContext';
import type { AssetRegistryEntry, TimelineConfig, TrackDefinition } from '@/tools/video-editor/types';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';
export type RenderStatus = 'idle' | 'rendering' | 'done' | 'error';

export type ClipTab = 'effects' | 'timing' | 'position' | 'audio' | 'text';

export interface EditorPreferences {
  scaleWidth: number;
  activeClipTab: ClipTab;
  assetPanel: {
    showAll: boolean;
    showHidden: boolean;
    hidden: string[];
  };
}

const defaultPreferences: EditorPreferences = {
  scaleWidth: 160,
  activeClipTab: 'effects',
  assetPanel: {
    showAll: false,
    showHidden: false,
    hidden: [],
  },
};

export function shouldAcceptPolledData(
  editSeq: number,
  savedSeq: number,
  polledSig: string,
  lastSavedSig: string,
): boolean {
  if (savedSeq < editSeq) {
    return false;
  }

  return polledSig !== lastSavedSig;
}

export interface UseTimelineDataResult {
  data: TimelineData | null;
  resolvedConfig: TimelineData['resolvedConfig'] | null;
  selectedClipId: string | null;
  selectedTrackId: string | null;
  selectedClip: TimelineData['resolvedConfig']['clips'][number] | null;
  selectedTrack: TrackDefinition | null;
  selectedClipHasPredecessor: boolean;
  compositionSize: { width: number; height: number };
  trackScaleMap: Record<string, number>;
  saveStatus: SaveStatus;
  renderStatus: RenderStatus;
  renderLog: string;
  renderDirty: boolean;
  renderProgress: { current: number; total: number; percent: number; phase: string } | null;
  renderResultUrl: string | null;
  renderResultFilename: string | null;
  scale: number;
  scaleWidth: number;
  isLoading: boolean;
  dataRef: React.MutableRefObject<TimelineData | null>;
  preferences: EditorPreferences;
  setSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>;
  setSelectedTrackId: React.Dispatch<React.SetStateAction<string | null>>;
  setRenderStatus: React.Dispatch<React.SetStateAction<RenderStatus>>;
  setRenderLog: React.Dispatch<React.SetStateAction<string>>;
  setRenderDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setScaleWidth: (updater: number | ((value: number) => number)) => void;
  setActiveClipTab: (tab: ClipTab) => void;
  setAssetPanelState: (patch: Partial<EditorPreferences['assetPanel']>) => void;
  applyTimelineEdit: (
    nextRows: TimelineRow[],
    metaUpdates?: Record<string, Partial<ClipMeta>>,
    metaDeletes?: string[],
    clipOrderOverride?: ClipOrderMap,
    options?: { save?: boolean },
  ) => void;
  applyResolvedConfigEdit: (
    nextResolvedConfig: TimelineData['resolvedConfig'],
    options?: { selectedClipId?: string | null; selectedTrackId?: string | null },
  ) => void;
  patchRegistry: (assetId: string, entry: AssetRegistryEntry, src?: string) => void;
  registerAsset: (assetId: string, entry: AssetRegistryEntry) => Promise<void>;
  queryClient: ReturnType<typeof useQueryClient>;
  uploadAsset: (file: File) => Promise<{ assetId: string; entry: AssetRegistryEntry }>;
  uploadFiles: (files: File[]) => Promise<void>;
  invalidateAssetRegistry: () => Promise<void>;
  reloadFromServer: () => Promise<void>;
  startRender: () => Promise<void>;
}

function buildDataFromCurrentRegistry(
  config: TimelineConfig,
  current: TimelineData,
): TimelineData {
  const rowData = configToRows(config);
  const resolvedConfig = {
    output: { ...config.output },
    tracks: config.tracks ?? [],
    clips: config.clips.map((clip) => ({
      ...clip,
      assetEntry: clip.asset ? current.resolvedConfig.registry[clip.asset] : undefined,
    })),
    registry: { ...current.resolvedConfig.registry },
  };

  return {
    config,
    registry: { ...current.registry },
    resolvedConfig,
    rows: rowData.rows,
    meta: rowData.meta,
    effects: rowData.effects,
    assetMap: Object.fromEntries(
      Object.entries(current.registry.assets ?? {}).map(([assetId, entry]) => [assetId, entry.file]),
    ),
    output: { ...config.output },
    tracks: config.tracks ?? [],
    clipOrder: rowData.clipOrder,
    signature: getConfigSignature(resolvedConfig),
  };
}

export function useTimelineData(): UseTimelineDataResult {
  const queryClient = useQueryClient();
  const { provider, timelineId, userId } = useVideoEditorRuntime();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignature = useRef('');
  const editSeqRef = useRef(0);
  const savedSeqRef = useRef(0);
  const dataRef = useRef<TimelineData | null>(null);
  const configSignatureRef = useRef<string | null>(null);
  const stableResolvedConfigRef = useRef<TimelineData['resolvedConfig'] | null>(null);
  const lastRegistryDataRef = useRef<Awaited<ReturnType<typeof provider.loadAssetRegistry>> | null>(null);

  const [data, setData] = useState<TimelineData | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [renderStatus, setRenderStatus] = useState<RenderStatus>('idle');
  const [renderLog, setRenderLog] = useState('');
  const [renderDirty, setRenderDirty] = useState(false);
  const [renderProgress, setRenderProgress] = useState<{ current: number; total: number; percent: number; phase: string } | null>(null);
  const [renderResultUrl, setRenderResultUrl] = useState<string | null>(null);
  const [renderResultFilename, setRenderResultFilename] = useState<string | null>(null);
  const [preferences, setPreferences] = useEditorSettings<EditorPreferences>(`video-editor:preferences:${timelineId}`, defaultPreferences);
  const selectedClipIdRef = useRef<string | null>(selectedClipId);
  const selectedTrackIdRef = useRef<string | null>(selectedTrackId);

  const scale = 5;
  const scaleWidth = preferences.scaleWidth;

  useLayoutEffect(() => {
    dataRef.current = data;
    selectedClipIdRef.current = selectedClipId;
    selectedTrackIdRef.current = selectedTrackId;
  }, [data, selectedClipId, selectedTrackId]);

  const timelineQuery = useQuery({
    queryKey: timelineQueryKey(timelineId),
    enabled: Boolean(timelineId),
    queryFn: () => loadTimelineJsonFromProvider(provider, timelineId),
    refetchInterval: 30_000,
  });

  const assetRegistryQuery = useQuery({
    queryKey: assetRegistryQueryKey(timelineId),
    enabled: Boolean(timelineId),
    queryFn: () => provider.loadAssetRegistry(timelineId),
    refetchInterval: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: (config: TimelineConfig) => provider.saveTimeline(timelineId, config),
    onError: () => {
      setSaveStatus('error');
      const current = dataRef.current;
      if (current) {
        scheduleSave(current, { preserveStatus: true });
      }
    },
  });

  const materializeData = useCallback((
    current: TimelineData,
    rows: TimelineRow[],
    meta: Record<string, ClipMeta>,
    clipOrder: ClipOrderMap,
  ): TimelineData => {
    const config = rowsToConfig(rows, meta, current.output, clipOrder, current.tracks, current.config.customEffects);
    let result = buildDataFromCurrentRegistry(config, current);
    result = preserveUploadingClips({ ...current, rows, meta } as TimelineData, result);
    return result;
  }, []);

  const saveTimeline = useCallback(async (nextData: TimelineData, seq: number) => {
    setSaveStatus('saving');
    await saveMutation.mutateAsync(nextData.config, {
      onSuccess: () => {
        if (seq > savedSeqRef.current) {
          savedSeqRef.current = seq;
          lastSavedSignature.current = nextData.signature;
        }

        setSaveStatus(seq >= editSeqRef.current ? 'saved' : 'dirty');
        setRenderDirty(true);
      },
    });
  }, [saveMutation]);

  const scheduleSave = useCallback((nextData: TimelineData, options?: { preserveStatus?: boolean }) => {
    if (!options?.preserveStatus) {
      setSaveStatus('dirty');
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const seq = editSeqRef.current;
      void saveTimeline(nextData, seq);
    }, 500);
  }, [saveTimeline]);

  const commitData = useCallback((
    nextData: TimelineData,
    options?: {
      save?: boolean;
      selectedClipId?: string | null;
      selectedTrackId?: string | null;
      updateLastSavedSignature?: boolean;
    },
  ) => {
    dataRef.current = nextData;
    setData(nextData);
    if (options?.selectedClipId !== undefined) {
      selectedClipIdRef.current = options.selectedClipId;
      setSelectedClipId(options.selectedClipId);
    } else if (selectedClipIdRef.current && !nextData.meta[selectedClipIdRef.current]) {
      selectedClipIdRef.current = null;
      setSelectedClipId(null);
    }

    if (options?.selectedTrackId !== undefined) {
      selectedTrackIdRef.current = options.selectedTrackId;
      setSelectedTrackId(options.selectedTrackId);
    } else {
      const fallbackTrackId = selectedTrackIdRef.current && nextData.tracks.some((track) => track.id === selectedTrackIdRef.current)
        ? selectedTrackIdRef.current
        : nextData.tracks[0]?.id ?? null;
      selectedTrackIdRef.current = fallbackTrackId;
      setSelectedTrackId(fallbackTrackId);
    }

    if (options?.updateLastSavedSignature) {
      lastSavedSignature.current = nextData.signature;
    }

    if (options?.save ?? true) {
      editSeqRef.current += 1;
      scheduleSave(nextData);
    }
  }, [scheduleSave]);

  const applyTimelineEdit = useCallback((
    nextRows: TimelineRow[],
    metaUpdates?: Record<string, Partial<ClipMeta>>,
    metaDeletes?: string[],
    clipOrderOverride?: ClipOrderMap,
    options?: { save?: boolean },
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const nextMeta: Record<string, ClipMeta> = { ...current.meta };
    if (metaUpdates) {
      for (const [clipId, patch] of Object.entries(metaUpdates)) {
        nextMeta[clipId] = nextMeta[clipId] ? { ...nextMeta[clipId], ...patch } : (patch as ClipMeta);
      }
    }

    if (metaDeletes) {
      for (const clipId of metaDeletes) {
        delete nextMeta[clipId];
      }
    }

    const clipOrder = clipOrderOverride ?? buildTrackClipOrder(current.tracks, current.clipOrder, metaDeletes);
    const nextData = materializeData(current, nextRows, nextMeta, clipOrder);
    commitData(nextData, { save: options?.save });
  }, [commitData, materializeData]);

  const applyResolvedConfigEdit = useCallback((
    nextResolvedConfig: TimelineData['resolvedConfig'],
    options?: { selectedClipId?: string | null; selectedTrackId?: string | null },
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    let nextData = buildDataFromCurrentRegistry(serializeForDisk(nextResolvedConfig), current);
    nextData = preserveUploadingClips(current, nextData);
    commitData(nextData, {
      selectedClipId: options?.selectedClipId,
      selectedTrackId: options?.selectedTrackId,
    });
  }, [commitData]);

  const patchRegistry = useCallback((assetId: string, entry: AssetRegistryEntry, src?: string) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const nextRegistry = {
      ...current.registry,
      assets: {
        ...current.registry.assets,
        [assetId]: entry,
      },
    };
    const nextResolvedRegistry = {
      ...current.resolvedConfig.registry,
      [assetId]: {
        ...entry,
        src: src ?? current.resolvedConfig.registry[assetId]?.src ?? entry.file,
      },
    };
    const nextConfig = {
      ...current.config,
      customEffects: current.config.customEffects ? { ...current.config.customEffects } : undefined,
    };
    const rowData = configToRows(nextConfig);
    const nextData: TimelineData = {
      ...current,
      config: nextConfig,
      registry: nextRegistry,
      resolvedConfig: {
        ...current.resolvedConfig,
        registry: nextResolvedRegistry,
        clips: current.resolvedConfig.clips.map((clip) => ({
          ...clip,
          assetEntry: clip.asset ? nextResolvedRegistry[clip.asset] : undefined,
        })),
      },
      rows: rowData.rows,
      meta: rowData.meta,
      effects: rowData.effects,
      assetMap: Object.fromEntries(
        Object.entries(nextRegistry.assets ?? {}).map(([nextAssetId, nextEntry]) => [nextAssetId, nextEntry.file]),
      ),
      clipOrder: rowData.clipOrder,
    };
    nextData.signature = getConfigSignature(nextData.resolvedConfig);
    commitData(nextData, {
      save: false,
      selectedClipId: selectedClipIdRef.current,
      selectedTrackId: selectedTrackIdRef.current,
    });
  }, [commitData]);

  const commitDataRef = useRef(commitData);
  useLayoutEffect(() => {
    commitDataRef.current = commitData;
  }, [commitData]);

  useEffect(() => {
    const polledData = timelineQuery.data;
    if (!polledData) return;

    if (!shouldAcceptPolledData(
      editSeqRef.current,
      savedSeqRef.current,
      polledData.signature,
      lastSavedSignature.current,
    )) {
      return;
    }

    const syncHandle = window.setTimeout(() => {
      if (shouldAcceptPolledData(
        editSeqRef.current,
        savedSeqRef.current,
        polledData.signature,
        lastSavedSignature.current,
      )) {
        let accepted = polledData;
        const prev = dataRef.current;
        if (prev) {
          accepted = preserveUploadingClips(prev, accepted);
        }
        commitDataRef.current(accepted, { save: false, updateLastSavedSignature: true });
      }
    }, 0);

    return () => {
      window.clearTimeout(syncHandle);
    };
  }, [timelineQuery.data]);

  useEffect(() => {
    const current = dataRef.current;
    const registry = assetRegistryQuery.data;
    if (!current || !registry) {
      return;
    }

    if (savedSeqRef.current < editSeqRef.current) {
      return;
    }

    if (registry === lastRegistryDataRef.current) {
      return;
    }
    lastRegistryDataRef.current = registry;

    void buildTimelineData(current.config, registry, (file) => provider.resolveAssetUrl(file)).then((nextData) => {
      if (nextData.signature === current.signature && Object.keys(nextData.assetMap).length === Object.keys(current.assetMap).length) {
        return;
      }

      const syncHandle = window.setTimeout(() => {
        if (savedSeqRef.current < editSeqRef.current) return;
        commitDataRef.current(nextData, {
          save: false,
          selectedClipId: selectedClipIdRef.current,
          selectedTrackId: selectedTrackIdRef.current,
        });
      }, 0);

      return () => {
        window.clearTimeout(syncHandle);
      };
    });
  }, [assetRegistryQuery.data, provider]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }

      if (renderResultUrl) {
        URL.revokeObjectURL(renderResultUrl);
      }
    };
  }, [renderResultUrl]);

  const resolvedConfig = useMemo(() => {
    if (!data) {
      configSignatureRef.current = null;
      stableResolvedConfigRef.current = null;
      return null;
    }

    if (configSignatureRef.current !== data.signature) {
      configSignatureRef.current = data.signature;
      stableResolvedConfigRef.current = data.resolvedConfig;
    }

    return stableResolvedConfigRef.current;
  }, [data]);
  const selectedClip = useMemo(() => {
    if (!resolvedConfig || !selectedClipId) {
      return null;
    }
    return resolvedConfig.clips.find((clip) => clip.id === selectedClipId) ?? null;
  }, [resolvedConfig, selectedClipId]);

  const selectedTrack = useMemo(() => {
    if (!data) {
      return null;
    }

    const preferredTrackId = selectedClip?.track ?? selectedTrackId;
    return preferredTrackId ? getTrackById(data.resolvedConfig, preferredTrackId) : data.tracks[0] ?? null;
  }, [data, selectedClip, selectedTrackId]);

  const selectedClipHasPredecessor = useMemo(() => {
    if (!resolvedConfig || !selectedClip) {
      return false;
    }

    const siblings = resolvedConfig.clips
      .filter((clip) => clip.track === selectedClip.track)
      .sort((left, right) => left.at - right.at);
    const selectedIndex = siblings.findIndex((clip) => clip.id === selectedClip.id);
    return selectedIndex > 0;
  }, [resolvedConfig, selectedClip]);

  const compositionSize = useMemo(() => {
    return data ? parseResolution(data.output.resolution) : { width: 1280, height: 720 };
  }, [data]);

  const renderMetadata = useMemo(() => {
    if (!resolvedConfig) {
      return null;
    }

    const fps = resolvedConfig.output.fps;
    const { width, height } = parseResolution(resolvedConfig.output.resolution);

    return {
      fps,
      durationInFrames: Math.max(
        1,
        ...resolvedConfig.clips.map((clip) => secondsToFrames(clip.at, fps) + getClipDurationInFrames(clip, fps)),
      ),
      compositionWidth: Math.max(1, width),
      compositionHeight: Math.max(1, height),
    };
  }, [resolvedConfig]);

  const trackScaleMap = useMemo(() => {
    if (!data) {
      return {};
    }

    return Object.fromEntries(data.tracks.map((track) => [track.id, track.scale ?? 1]));
  }, [data]);

  const setScaleWidth = useCallback((updater: number | ((value: number) => number)) => {
    setPreferences((current) => ({
      ...current,
      scaleWidth: typeof updater === 'function' ? (updater as (value: number) => number)(current.scaleWidth) : updater,
    }));
  }, [setPreferences]);

  const setActiveClipTab = useCallback((tab: ClipTab) => {
    setPreferences((current) => ({
      ...current,
      activeClipTab: tab,
    }));
  }, [setPreferences]);

  const setAssetPanelState = useCallback((patch: Partial<EditorPreferences['assetPanel']>) => {
    setPreferences((current) => ({
      ...current,
      assetPanel: {
        ...current.assetPanel,
        ...patch,
      },
    }));
  }, [setPreferences]);

  const uploadAsset = useCallback(async (file: File) => {
    if (!provider.uploadAsset) {
      throw new Error('This editor backend does not support asset uploads');
    }

    return provider.uploadAsset(file, { timelineId, userId });
  }, [provider, timelineId, userId]);

  const registerAsset = useCallback(async (assetId: string, entry: AssetRegistryEntry) => {
    if (!provider.registerAsset) {
      throw new Error('This editor backend does not support asset registration');
    }

    await provider.registerAsset(timelineId, assetId, entry);
    await queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(timelineId) });
  }, [provider, queryClient, timelineId]);

  const uploadFiles = useCallback(async (files: File[]) => {
    await Promise.all(files.map(uploadAsset));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: timelineQueryKey(timelineId) }),
      queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(timelineId) }),
    ]);
  }, [queryClient, timelineId, uploadAsset]);

  const invalidateAssetRegistry = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: assetRegistryQueryKey(timelineId) });
  }, [queryClient, timelineId]);

  const reloadFromServer = useCallback(async () => {
    const [config, registry] = await Promise.all([
      provider.loadTimeline(timelineId),
      provider.loadAssetRegistry(timelineId),
    ]);
    const nextData = await buildTimelineData(config, registry, (file) => provider.resolveAssetUrl(file));
    editSeqRef.current = savedSeqRef.current;
    commitData(nextData, {
      save: false,
      updateLastSavedSignature: true,
      selectedClipId: selectedClipIdRef.current,
      selectedTrackId: selectedTrackIdRef.current,
    });
    setSaveStatus('saved');
  }, [commitData, provider, timelineId]);

  const startRender = useClientRender({
    resolvedConfig,
    metadata: renderMetadata,
    setRenderStatus,
    setRenderProgress,
    setRenderLog,
    setRenderDirty,
    setRenderResult: (updater) => {
      const nextValue = typeof updater === 'function'
        ? updater({ url: renderResultUrl, filename: renderResultFilename })
        : updater;

      if (renderResultUrl && renderResultUrl !== nextValue.url) {
        URL.revokeObjectURL(renderResultUrl);
      }

      setRenderResultUrl(nextValue.url);
      setRenderResultFilename(nextValue.filename);
    },
  });

  return {
    data,
    resolvedConfig,
    selectedClipId,
    selectedTrackId,
    selectedClip,
    selectedTrack,
    selectedClipHasPredecessor,
    compositionSize,
    trackScaleMap,
    saveStatus,
    renderStatus,
    renderLog,
    renderDirty,
    renderProgress,
    renderResultUrl,
    renderResultFilename,
    scale,
    scaleWidth,
    isLoading: timelineQuery.isLoading && !data,
    dataRef,
    preferences,
    setSelectedClipId,
    setSelectedTrackId,
    setRenderStatus,
    setRenderLog,
    setRenderDirty,
    setScaleWidth,
    setActiveClipTab,
    setAssetPanelState,
    applyTimelineEdit,
    applyResolvedConfigEdit,
    patchRegistry,
    registerAsset,
    queryClient,
    uploadAsset,
    uploadFiles,
    invalidateAssetRegistry,
    reloadFromServer,
    startRender,
  };
}
