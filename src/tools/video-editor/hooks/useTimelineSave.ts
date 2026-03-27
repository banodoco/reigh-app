import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { useMutation } from '@tanstack/react-query';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/DataProviderContext';
import {
  isTimelineVersionConflictError,
  type DataProvider,
} from '@/tools/video-editor/data/DataProvider';
import { buildTrackClipOrder } from '@/tools/video-editor/lib/coordinate-utils';
import { migrateToFlatTracks } from '@/tools/video-editor/lib/migrate';
import { serializeForDisk } from '@/tools/video-editor/lib/serialize';
import {
  buildDataFromCurrentRegistry,
  shouldAcceptPolledData,
} from '@/tools/video-editor/lib/timeline-save-utils';
import {
  assembleTimelineData,
  buildTimelineData,
  preserveUploadingClips,
  rowsToConfig,
  type ClipMeta,
  type ClipOrderMap,
  type TimelineData,
} from '@/tools/video-editor/lib/timeline-data';
import type { TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
import type { AssetRegistryEntry, TimelineConfig } from '@/tools/video-editor/types';

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'error';
export { shouldAcceptPolledData } from '@/tools/video-editor/lib/timeline-save-utils';

const MAX_CONFLICT_RETRIES = 3;

type CommitHistoryOptions = {
  transactionId?: string;
  semantic?: boolean;
};

type CommitDataOptions = {
  save?: boolean;
  selectedClipId?: string | null;
  selectedTrackId?: string | null;
  updateLastSavedSignature?: boolean;
  transactionId?: string;
  semantic?: boolean;
  skipHistory?: boolean;
};

interface UseTimelineSaveQueries {
  timelineQuery: {
    data: TimelineData | undefined;
    isLoading: boolean;
  };
  assetRegistryQuery: {
    data: Awaited<ReturnType<DataProvider['loadAssetRegistry']>> | undefined;
  };
}

export function useTimelineSave(
  { timelineQuery, assetRegistryQuery }: UseTimelineSaveQueries,
  provider: DataProvider,
  onSaveSuccessRef: MutableRefObject<(() => void) | null>,
  pruneSelectionRef: MutableRefObject<((validIds: Set<string>) => void) | null>,
) {
  const { timelineId } = useVideoEditorRuntime();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedSignature = useRef('');
  const editSeqRef = useRef(0);
  const savedSeqRef = useRef(0);
  const configVersionRef = useRef(1);
  const conflictRetryRef = useRef(0);
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef<{ data: TimelineData; seq: number } | null>(null);
  const dataRef = useRef<TimelineData | null>(null);
  const lastRegistryDataRef = useRef<Awaited<ReturnType<typeof provider.loadAssetRegistry>> | null>(null);
  const selectedClipIdRef = useRef<string | null>(null);
  const selectedTrackIdRef = useRef<string | null>(null);
  const onBeforeCommitRef = useRef<((currentData: TimelineData, options: CommitHistoryOptions) => void) | null>(null);

  const [data, setData] = useState<TimelineData | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [isConflictExhausted, setIsConflictExhausted] = useState(false);

  useLayoutEffect(() => {
    dataRef.current = data;
    selectedClipIdRef.current = selectedClipId;
    selectedTrackIdRef.current = selectedTrackId;
  }, [data, selectedClipId, selectedTrackId]);

  useEffect(() => {
    if (timelineQuery.data) {
      configVersionRef.current = timelineQuery.data.configVersion;
    }
  }, [timelineQuery.data]);

  const scheduleSaveRef = useRef<(nextData: TimelineData, options?: { preserveStatus?: boolean }) => void>(
    () => undefined,
  );

  const handleConflictExhausted = useCallback((details: {
    expectedVersion: number;
    actualVersion?: number;
    retries: number;
    reason: 'load_failed' | 'max_retries' | 'missing_local_data';
  }) => {
    console.log('[TimelineSave] conflict retries exhausted', details);
    setIsConflictExhausted(true);
    setSaveStatus('error');
  }, []);

  const saveMutation = useMutation({
    mutationFn: ({ config, expectedVersion }: { config: TimelineConfig; expectedVersion: number }) => {
      return provider.saveTimeline(timelineId, config, expectedVersion);
    },
  });

  const materializeData = useCallback((
    current: TimelineData,
    rows: TimelineRow[],
    meta: Record<string, ClipMeta>,
    clipOrder: ClipOrderMap,
  ) => {
    const config = rowsToConfig(
      rows,
      meta,
      current.output,
      clipOrder,
      current.tracks,
      current.config.customEffects,
    );

    return preserveUploadingClips(
      { ...current, rows, meta } as TimelineData,
      buildDataFromCurrentRegistry(config, current),
    );
  }, []);

  const saveTimeline = useCallback(async (
    nextData: TimelineData,
    seq: number,
    options?: {
      bypassQueue?: boolean;
      completedSeqRef?: { current: number | null };
    },
  ) => {
    if (isSavingRef.current && !options?.bypassQueue) {
      pendingSaveRef.current = { data: nextData, seq };
      return;
    }

    const completedSeqRef = options?.completedSeqRef ?? { current: null };

    if (!options?.bypassQueue) {
      isSavingRef.current = true;
    }
    setSaveStatus('saving');
    try {
      const expectedVersion = configVersionRef.current;
      await saveMutation.mutateAsync(
        {
          config: nextData.config,
          expectedVersion,
        },
        {
          onSuccess: (nextVersion) => {
            configVersionRef.current = nextVersion;
            completedSeqRef.current = seq;

            if (conflictRetryRef.current > 0) {
              console.log('[TimelineSave] conflict retry succeeded', {
                attempts: conflictRetryRef.current,
                finalVersion: nextVersion,
              });
            }

            conflictRetryRef.current = 0;
            setIsConflictExhausted(false);

            if (dataRef.current?.signature === nextData.signature) {
              const persistedData = {
                ...dataRef.current,
                configVersion: nextVersion,
              };
              dataRef.current = persistedData;
              setData(persistedData);
            }

            if (seq > savedSeqRef.current) {
              savedSeqRef.current = seq;
              lastSavedSignature.current = nextData.signature;
            }

            setSaveStatus(seq >= editSeqRef.current ? 'saved' : 'dirty');
            onSaveSuccessRef.current?.();
          },
        },
      );
    } catch (error) {
      if (isTimelineVersionConflictError(error)) {
        const expectedVersion = configVersionRef.current;
        let actualVersion: number | undefined;

        try {
          const loaded = await provider.loadTimeline(timelineId);
          actualVersion = loaded.configVersion;
          configVersionRef.current = loaded.configVersion;
          console.log('[TimelineSave] conflict detected', {
            expectedVersion,
            actualVersion,
          });
        } catch {
          handleConflictExhausted({
            expectedVersion,
            retries: conflictRetryRef.current,
            reason: 'load_failed',
          });
          return;
        }

        if (!dataRef.current) {
          handleConflictExhausted({
            expectedVersion,
            actualVersion,
            retries: conflictRetryRef.current,
            reason: 'missing_local_data',
          });
          return;
        }

        if (conflictRetryRef.current >= MAX_CONFLICT_RETRIES) {
          handleConflictExhausted({
            expectedVersion,
            actualVersion,
            retries: conflictRetryRef.current,
            reason: 'max_retries',
          });
          return;
        }

        conflictRetryRef.current += 1;
        console.log('[TimelineSave] retrying save after conflict', {
          attempt: conflictRetryRef.current,
          expectedVersion,
          actualVersion,
        });
        return await saveTimeline(dataRef.current, editSeqRef.current, {
          bypassQueue: true,
          completedSeqRef,
        });
      }

      setSaveStatus('error');
      if (dataRef.current) {
        scheduleSaveRef.current(dataRef.current, { preserveStatus: true });
      }
    } finally {
      if (!options?.bypassQueue) {
        isSavingRef.current = false;

        const pendingSave = pendingSaveRef.current;
        if (pendingSave) {
          pendingSaveRef.current = null;
          if (completedSeqRef.current === null || pendingSave.seq > completedSeqRef.current) {
            void saveTimeline(pendingSave.data, pendingSave.seq);
          }
        }
      }
    }
  }, [handleConflictExhausted, onSaveSuccessRef, provider, saveMutation, timelineId]);

  const scheduleSave = useCallback((nextData: TimelineData, options?: { preserveStatus?: boolean }) => {
    if (!options?.preserveStatus) {
      setSaveStatus('dirty');
    }

    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }

    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      conflictRetryRef.current = 0;
      void saveTimeline(nextData, editSeqRef.current);
    }, 500);
  }, [saveTimeline]);

  useLayoutEffect(() => {
    scheduleSaveRef.current = scheduleSave;
  }, [scheduleSave]);

  const commitData = useCallback((
    nextData: TimelineData,
    options?: CommitDataOptions,
  ) => {
    const shouldSave = options?.save ?? true;
    const currentData = dataRef.current;

    if (shouldSave && !options?.skipHistory && currentData) {
      onBeforeCommitRef.current?.(currentData, {
        transactionId: options?.transactionId,
        semantic: options?.semantic,
      });
    }

    dataRef.current = nextData;
    setData(nextData);

    if (options?.selectedClipId !== undefined) {
      selectedClipIdRef.current = options.selectedClipId;
      setSelectedClipId(options.selectedClipId);
    } else if (selectedClipIdRef.current && !nextData.meta[selectedClipIdRef.current]) {
      selectedClipIdRef.current = null;
      setSelectedClipId(null);
    }

    pruneSelectionRef.current?.(new Set(Object.keys(nextData.meta)));

    if (options?.selectedTrackId !== undefined) {
      selectedTrackIdRef.current = options.selectedTrackId;
      setSelectedTrackId(options.selectedTrackId);
    } else {
      const fallbackTrackId = selectedTrackIdRef.current
        && nextData.tracks.some((track) => track.id === selectedTrackIdRef.current)
        ? selectedTrackIdRef.current
        : nextData.tracks[0]?.id ?? null;
      selectedTrackIdRef.current = fallbackTrackId;
      setSelectedTrackId(fallbackTrackId);
    }

    if (options?.updateLastSavedSignature) {
      lastSavedSignature.current = nextData.signature;
    }

    if (shouldSave) {
      editSeqRef.current += 1;
      scheduleSave(nextData);
    }
  }, [pruneSelectionRef, scheduleSave]);

  const applyTimelineEdit = useCallback((
    nextRows: TimelineRow[],
    metaUpdates?: Record<string, Partial<ClipMeta>>,
    metaDeletes?: string[],
    clipOrderOverride?: ClipOrderMap,
    options?: { save?: boolean; transactionId?: string; semantic?: boolean },
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    const nextMeta: Record<string, ClipMeta> = { ...current.meta };

    if (metaUpdates) {
      for (const [clipId, patch] of Object.entries(metaUpdates)) {
        nextMeta[clipId] = nextMeta[clipId]
          ? { ...nextMeta[clipId], ...patch }
          : (patch as ClipMeta);
      }
    }

    if (metaDeletes) {
      for (const clipId of metaDeletes) {
        delete nextMeta[clipId];
      }
    }

    commitData(
      materializeData(
        current,
        nextRows,
        nextMeta,
        clipOrderOverride ?? buildTrackClipOrder(current.tracks, current.clipOrder, metaDeletes),
      ),
      {
        save: options?.save,
        transactionId: options?.transactionId,
        semantic: options?.semantic,
      },
    );
  }, [commitData, materializeData]);

  const applyResolvedConfigEdit = useCallback((
    nextResolvedConfig: TimelineData['resolvedConfig'],
    options?: { selectedClipId?: string | null; selectedTrackId?: string | null; semantic?: boolean },
  ) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    commitData(
      preserveUploadingClips(current, buildDataFromCurrentRegistry(serializeForDisk(nextResolvedConfig), current)),
      {
        selectedClipId: options?.selectedClipId,
        selectedTrackId: options?.selectedTrackId,
        semantic: options?.semantic,
      },
    );
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
      customEffects: current.config.customEffects
        ? { ...current.config.customEffects }
        : undefined,
    };
    const migratedConfig = migrateToFlatTracks(nextConfig);
    migratedConfig.tracks = migratedConfig.tracks ?? [];

    const nextData = assembleTimelineData({
      config: migratedConfig,
      configVersion: current.configVersion,
      registry: nextRegistry,
      resolvedConfig: {
        output: { ...migratedConfig.output },
        tracks: migratedConfig.tracks,
        clips: migratedConfig.clips.map((clip) => ({
          ...clip,
          assetEntry: clip.asset ? nextResolvedRegistry[clip.asset] : undefined,
        })),
        // Reuse resolved entries for unchanged assets and patch the current asset in-place.
        registry: nextResolvedRegistry,
      },
      assetMap: Object.fromEntries(
        Object.entries(nextRegistry.assets ?? {}).map(([nextAssetId, nextEntry]) => [nextAssetId, nextEntry.file]),
      ),
      output: { ...migratedConfig.output },
    });

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
    if (
      !polledData
      || !shouldAcceptPolledData(
        editSeqRef.current,
        savedSeqRef.current,
        polledData.signature,
        lastSavedSignature.current,
      )
    ) {
      return;
    }

    const syncHandle = window.setTimeout(() => {
      if (
        !shouldAcceptPolledData(
          editSeqRef.current,
          savedSeqRef.current,
          polledData.signature,
          lastSavedSignature.current,
        )
      ) {
        return;
      }

      configVersionRef.current = polledData.configVersion;
      commitDataRef.current(
        dataRef.current ? preserveUploadingClips(dataRef.current, polledData) : polledData,
        { save: false, skipHistory: true, updateLastSavedSignature: true },
      );
    }, 0);

    return () => window.clearTimeout(syncHandle);
  }, [timelineQuery.data]);

  useEffect(() => {
    const current = dataRef.current;
    const registry = assetRegistryQuery.data;
    if (
      !current
      || !registry
      || savedSeqRef.current < editSeqRef.current
      || registry === lastRegistryDataRef.current
    ) {
      return;
    }

    lastRegistryDataRef.current = registry;

    void buildTimelineData(
      current.config,
      registry,
      (file) => provider.resolveAssetUrl(file),
      current.configVersion,
    ).then((nextData) => {
      if (
        nextData.signature === current.signature
        && Object.keys(nextData.assetMap).length === Object.keys(current.assetMap).length
      ) {
        return;
      }

      const syncHandle = window.setTimeout(() => {
        if (savedSeqRef.current < editSeqRef.current) {
          return;
        }

        commitDataRef.current(nextData, {
          save: false,
          skipHistory: true,
          selectedClipId: selectedClipIdRef.current,
          selectedTrackId: selectedTrackIdRef.current,
        });
      }, 0);

      return () => window.clearTimeout(syncHandle);
    });
  }, [assetRegistryQuery.data, provider]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  const reloadFromServer = useCallback(async () => {
    const [loadedTimeline, registry] = await Promise.all([
      provider.loadTimeline(timelineId),
      provider.loadAssetRegistry(timelineId),
    ]);

    conflictRetryRef.current = 0;
    pendingSaveRef.current = null;
    setIsConflictExhausted(false);
    editSeqRef.current = savedSeqRef.current;
    configVersionRef.current = loadedTimeline.configVersion;

    commitData(
      await buildTimelineData(
        loadedTimeline.config,
        registry,
        (file) => provider.resolveAssetUrl(file),
        loadedTimeline.configVersion,
      ),
      {
        save: false,
        skipHistory: true,
        updateLastSavedSignature: true,
        selectedClipId: selectedClipIdRef.current,
        selectedTrackId: selectedTrackIdRef.current,
      },
    );
    setSaveStatus('saved');
  }, [commitData, provider, timelineId]);

  const retrySaveAfterConflict = useCallback(async () => {
    if (!dataRef.current) {
      return;
    }

    setIsConflictExhausted(false);
    setSaveStatus('saving');
    conflictRetryRef.current = 0;

    try {
      const loaded = await provider.loadTimeline(timelineId);
      configVersionRef.current = loaded.configVersion;
      if (dataRef.current) {
        void saveTimeline(dataRef.current, editSeqRef.current);
      }
    } catch {
      handleConflictExhausted({
        expectedVersion: configVersionRef.current,
        retries: conflictRetryRef.current,
        reason: 'load_failed',
      });
    }
  }, [handleConflictExhausted, provider, saveTimeline, timelineId]);

  return {
    data,
    dataRef,
    isConflictExhausted,
    selectedClipId,
    selectedTrackId,
    saveStatus,
    setSelectedClipId,
    setSelectedTrackId,
    applyTimelineEdit,
    applyResolvedConfigEdit,
    patchRegistry,
    commitData,
    onBeforeCommitRef,
    reloadFromServer,
    retrySaveAfterConflict,
    editSeqRef,
    savedSeqRef,
    selectedClipIdRef,
    selectedTrackIdRef,
    isLoading: timelineQuery.isLoading && !data,
  };
}
