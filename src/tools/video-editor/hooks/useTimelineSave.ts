import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { InteractionStateRef } from '@/tools/video-editor/lib/interaction-state.ts';
import { useTimelineCommit } from '@/tools/video-editor/hooks/useTimelineCommit.ts';
import { TimelineEventBus } from '@/tools/video-editor/hooks/useTimelineEventBus.ts';
import { useTimelinePersistence } from '@/tools/video-editor/hooks/useTimelinePersistence.ts';
import { clearTimelineDraft, loadTimelineDraft } from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';
import { buildTimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { getStableConfigSignature } from '@/tools/video-editor/lib/config-utils.ts';
import type { AssetRegistry, TimelineConfig } from '@/tools/video-editor/types/index.ts';
import { usePollSync, type UsePollSyncQueries } from '@/tools/video-editor/hooks/usePollSync.ts';
import type { TimelineStoreApi } from '@/tools/video-editor/hooks/timelineStore.ts';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import type { DataProvider } from '@/tools/video-editor/data/DataProvider.ts';
export { shouldAcceptPolledData } from '@/tools/video-editor/lib/timeline-save-utils.ts';
export type { SaveStatus } from '@/tools/video-editor/hooks/useTimelinePersistence.ts';

type UseTimelineSaveQueries = UsePollSyncQueries;

export type { InteractionStateRef } from '@/tools/video-editor/lib/interaction-state.ts';

export function useTimelineSave(
  queries: UseTimelineSaveQueries,
  provider: DataProvider,
  interactionStateRef: InteractionStateRef,
  store: TimelineStoreApi,
) {
  const { timelineId, assetResolver } = useVideoEditorRuntime();
  const resolveAssetUrl = useCallback((file: string) => {
    if (assetResolver) {
      return Promise.resolve(assetResolver.resolveAssetUrl(file));
    }

    return provider.resolveAssetUrl(file);
  }, [assetResolver, provider]);
  const lastSavedSignatureRef = useRef('');
  const savedSeqRef = useRef(0);
  // Start at 0 so a fresh bridge timeline (config_version 0) is not rejected
  // as "stale" by the poll gate (polled < current). The bridge CAS is strict
  // equality, so the first save POSTs expected_version 0 and succeeds.
  const configVersionRef = useRef(0);
  const eventBusRef = useRef(new TimelineEventBus());
  const commit = useTimelineCommit({
    eventBus: eventBusRef.current,
    lastSavedSignatureRef,
  });
  const persistence = useTimelinePersistence({
    store,
    provider,
    timelineId,
    resolveAssetUrl,
    eventBus: eventBusRef.current,
    dataRef: commit.dataRef,
    commitData: commit.commitData,
    selectedClipIdRef: commit.selectedClipIdRef,
    selectedTrackIdRef: commit.selectedTrackIdRef,
    editSeqRef: commit.editSeqRef,
    savedSeqRef,
    configVersionRef,
    lastSavedSignatureRef,
    interactionStateRef,
  });

  useEffect(() => {
    return eventBusRef.current.on('scheduleSave', persistence.scheduleSave);
  }, [persistence.scheduleSave]);

  usePollSync({
    store,
    queries,
    provider,
    resolveAssetUrl,
    commitData: commit.commitData,
    dataRef: commit.dataRef,
    selectedClipIdRef: commit.selectedClipIdRef,
    selectedTrackIdRef: commit.selectedTrackIdRef,
    editSeqRef: commit.editSeqRef,
    pendingOpsRef: commit.pendingOpsRef,
    savedSeqRef,
    configVersionRef,
    lastSavedSignatureRef,
    isSavingRef: persistence.isSavingRef,
    isConflictExhaustedRef: persistence.isConflictExhaustedRef,
    interactionStateRef,
  });

  // One-slot recovery draft (plan-v5 B9): after the timeline data loads, offer
  // any draft left by a crash / offline edit / save-as-copy. Offered once per
  // mount; the shell renders Retry / Discard.
  const [recoveryDraft, setRecoveryDraft] = useState<{
    updatedAt: string;
    baseVersion: number;
  } | null>(null);
  const [recoveredAsDirty, setRecoveredAsDirty] = useState(false);
  const recoveryOfferedRef = useRef(false);
  const recoveryKey = provider.getTimelineDraftRecoveryMetadata?.().recoveryKey ?? timelineId;

  useEffect(() => {
    if (recoveryOfferedRef.current || !commit.data) {
      return;
    }
    const loadedData = commit.data;
    let cancelled = false;
    // Best-effort: IndexedDB unavailable (private mode) or a corrupt store
    // simply means no recovery offer; never an unhandled rejection.
    void loadTimelineDraft(recoveryKey)
      .then((record) => {
        if (cancelled || !record) {
          return;
        }
        const draft = record.draft as { config?: TimelineConfig; registry?: AssetRegistry };
        // A save ACK clears the slot asynchronously. Another tab can load the
        // record in that window (or a late draft write can race the clear), so
        // the mere presence of a slot is not proof of unsaved work. If the
        // draft is already the server snapshot, discard it silently instead
        // of showing a false recovery banner.
        if (
          draft.config
          && getStableConfigSignature(draft.config, draft.registry ?? { assets: {} })
            === loadedData.stableSignature
        ) {
          if (recoveryKey === timelineId) {
            void clearTimelineDraft(recoveryKey).catch(() => {});
            return;
          }
          // Some providers hydrate this stable occurrence slot directly into
          // the visible editor. It is still an unacknowledged draft and must
          // remain retryable even though its signature matches the loaded data.
          setRecoveredAsDirty(true);
          recoveryOfferedRef.current = true;
          setRecoveryDraft({ updatedAt: record.updatedAt, baseVersion: record.baseVersion });
          return;
        }
        recoveryOfferedRef.current = true;
        setRecoveredAsDirty(recoveryKey !== timelineId);
        setRecoveryDraft({ updatedAt: record.updatedAt, baseVersion: record.baseVersion });
      })
      .catch(() => {
        // no recovery offer
      });
    return () => {
      cancelled = true;
    };
  }, [commit.data, recoveryKey, timelineId]);
  useEffect(() => {
    return eventBusRef.current.on('saveSuccess', () => {
      // Retry stays visible until the durable acknowledgement, not merely
      // until the save request is queued.
      setRecoveryDraft(null);
      setRecoveredAsDirty(false);
    });
  }, []);

  const retryRecoveredDraft = useCallback(async () => {
    let record: Awaited<ReturnType<typeof loadTimelineDraft>>;
    try {
      record = await loadTimelineDraft(recoveryKey);
    } catch {
      setRecoveryDraft(null);
      return;
    }
    if (!record) {
      setRecoveryDraft(null);
      setRecoveredAsDirty(false);
      return;
    }
    const draft = record.draft as { config?: TimelineConfig; registry?: AssetRegistry };
    if (!draft.config || !commit.data) {
      setRecoveryDraft(null);
      setRecoveredAsDirty(false);
      return;
    }
    const recovered = await buildTimelineData(
      draft.config,
      draft.registry ?? { assets: {} },
      resolveAssetUrl ?? ((file) => provider.resolveAssetUrl(file)),
      record.baseVersion,
    );
    // Retry against the version captured with the draft. Using a newer
    // polled version here would turn a stale recovery into an unconditional
    // overwrite instead of an honest CAS conflict.
    configVersionRef.current = record.baseVersion;
    // Keep the slot and visible recovery controls until a durable ACK. A 409
    // or transport failure must leave the recovered work retryable.
    setRecoveredAsDirty(true);
    commit.commitData(recovered, { save: true });
  }, [commit, configVersionRef, provider, recoveryKey, resolveAssetUrl]);

  const reloadFromServer = useCallback(async (options?: { clearDraft?: boolean; preserveDraft?: boolean }) => {
    await persistence.reloadFromServer(options);
    const shouldClearRecovery = options?.clearDraft ?? !options?.preserveDraft;
    if (shouldClearRecovery) {
      setRecoveryDraft(null);
      setRecoveredAsDirty(false);
    }
  }, [persistence.reloadFromServer]);
  const discardRecoveredDraft = useCallback(async () => {
    try {
      // Reload first. The persistence path clears the slot only after it has
      // built and committed fresh canonical data, so discarded content cannot
      // remain visible while the editor reports saved.
      await reloadFromServer({ clearDraft: true });
    } catch {
      return;
    }
    setRecoveryDraft(null);
    setRecoveredAsDirty(false);
  }, [reloadFromServer]);

  return {
    data: commit.data,
    dataRef: commit.dataRef,
    isConflictExhausted: persistence.isConflictExhausted,
    selectedClipId: commit.selectedClipId,
    selectedTrackId: commit.selectedTrackId,
    saveStatus: recoveredAsDirty && persistence.saveStatus === 'saved' ? 'dirty' : persistence.saveStatus,
    schemaIncompatible: persistence.schemaIncompatible,
    flushPendingSave: persistence.flushPendingSave,
    setSelectedTrackId: commit.setSelectedTrackId,
    applyEdit: commit.applyEdit,
    patchRegistry: commit.patchRegistry,
    unpatchRegistry: commit.unpatchRegistry,
    commitData: commit.commitData,
    eventBus: eventBusRef.current,
    reloadFromServer,
    retrySaveAfterConflict: persistence.retrySaveAfterConflict,
    editSeqRef: commit.editSeqRef,
    pendingOpsRef: commit.pendingOpsRef,
    savedSeqRef,
    selectedClipIdRef: commit.selectedClipIdRef,
    selectedTrackIdRef: commit.selectedTrackIdRef,
    isLoading: queries.timelineQuery.isLoading && !commit.data,
    watchdogTripped: persistence.watchdogTripped,
    watchdogReason: persistence.watchdogReason,
    retryWatchdog: persistence.retryWatchdog,
    recoveryDraft,
    retryRecoveredDraft,
    discardRecoveredDraft,
  };
}
