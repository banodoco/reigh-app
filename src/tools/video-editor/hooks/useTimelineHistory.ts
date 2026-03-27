import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/DataProviderContext';
import { buildDataFromCurrentRegistry } from '@/tools/video-editor/lib/timeline-save-utils';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { TimelineConfig } from '@/tools/video-editor/types';
import type {
  Checkpoint,
  CheckpointTriggerType,
  UndoEntry,
  UndoSnapshot,
} from '@/tools/video-editor/types/history';

const UNDO_STACK_LIMIT = 100;
const CHECKPOINT_LIMIT = 30;
const CHECKPOINT_RETENTION_MS = 24 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 5 * 60 * 1000;
const EDIT_DISTANCE_CHECKPOINT_THRESHOLD = 30;
const UNTRANSACTED_COLLAPSE_WINDOW_MS = 300;

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

export interface UseTimelineHistoryArgs {
  dataRef: MutableRefObject<TimelineData | null>;
  commitData: (nextData: TimelineData, options?: CommitDataOptions) => void;
}

export interface UseTimelineHistoryResult {
  canUndo: boolean;
  canRedo: boolean;
  checkpoints: Checkpoint[];
  onBeforeCommit: (currentData: TimelineData, options: CommitHistoryOptions) => void;
  undo: () => void;
  redo: () => void;
  jumpToCheckpoint: (checkpointId: string) => void;
  createManualCheckpoint: (label?: string) => Promise<void>;
  createCheckpoint: (label?: string) => Promise<void>;
}

function cloneConfig(config: TimelineConfig): TimelineConfig {
  return structuredClone(config);
}

function buildSnapshot(currentData: TimelineData): UndoSnapshot {
  const t0 = performance.now();
  const config = cloneConfig(currentData.config);
  const dt = performance.now() - t0;
  if (dt > 5) console.log('[TimelineHistory] structuredClone took', dt.toFixed(1), 'ms, clips:', config.clips.length);
  return { config, signature: currentData.signature };
}

function isCheckpointFresh(checkpoint: Checkpoint, now: number): boolean {
  return now - new Date(checkpoint.createdAt).getTime() <= CHECKPOINT_RETENTION_MS;
}

function trimCheckpoints(checkpoints: Checkpoint[], now = Date.now()): Checkpoint[] {
  const manual = checkpoints.filter((c) => c.triggerType === 'manual');
  const auto = checkpoints
    .filter((c) => c.triggerType !== 'manual' && isCheckpointFresh(c, now))
    .slice(0, CHECKPOINT_LIMIT);
  return [...manual, ...auto].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

function defaultCheckpointLabel(triggerType: CheckpointTriggerType): string {
  switch (triggerType) {
    case 'session_boundary':
      return 'Session checkpoint';
    case 'edit_distance':
      return 'Auto checkpoint';
    case 'semantic':
      return 'Before destructive edit';
    case 'manual':
      return 'Manual checkpoint';
  }
}

export function useTimelineHistory({
  dataRef,
  commitData,
}: UseTimelineHistoryArgs): UseTimelineHistoryResult {
  const { provider, timelineId } = useVideoEditorRuntime();
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const lastEditTimestampRef = useRef<number | null>(null);
  const editsSinceLastCheckpointRef = useRef(0);
  const lastUntransactedEditAtRef = useRef<number | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);

  const syncHistoryState = useCallback(() => {
    const nextCanUndo = undoStackRef.current.length > 0;
    const nextCanRedo = redoStackRef.current.length > 0;
    setCanUndo((current) => (current === nextCanUndo ? current : nextCanUndo));
    setCanRedo((current) => (current === nextCanRedo ? current : nextCanRedo));
  }, []);

  const appendCheckpoint = useCallback((checkpoint: Checkpoint) => {
    setCheckpoints((current) => {
      const deduped = [checkpoint, ...current.filter((entry) => entry.id !== checkpoint.id)];
      return trimCheckpoints(deduped);
    });
  }, []);

  const clearRedoStack = useCallback(() => {
    if (redoStackRef.current.length === 0) {
      return;
    }

    redoStackRef.current = [];
    syncHistoryState();
  }, [syncHistoryState]);

  const persistCheckpoint = useCallback(async (
    currentData: TimelineData,
    triggerType: CheckpointTriggerType,
    editsSinceLastCheckpoint: number,
    label?: string,
  ) => {
    if (!provider.saveCheckpoint) {
      return;
    }

    const createdAt = new Date().toISOString();
    const checkpointInput = {
      timelineId,
      config: cloneConfig(currentData.config),
      createdAt,
      triggerType,
      label: label?.trim() || defaultCheckpointLabel(triggerType),
      editsSinceLastCheckpoint,
    };

    try {
      const checkpointId = await provider.saveCheckpoint(timelineId, checkpointInput);
      appendCheckpoint({
        id: checkpointId,
        ...checkpointInput,
      });
    } catch {
      // Checkpoint persistence is best-effort and should not interrupt editing.
    }
  }, [appendCheckpoint, provider, timelineId]);

  const restoreSnapshot = useCallback((snapshot: UndoSnapshot) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    commitData(
      buildDataFromCurrentRegistry(cloneConfig(snapshot.config), current),
      { save: true, skipHistory: true },
    );
    lastEditTimestampRef.current = Date.now();
    lastUntransactedEditAtRef.current = null;
  }, [commitData, dataRef]);

  const pushUndoEntry = useCallback((entry: UndoEntry) => {
    undoStackRef.current = [...undoStackRef.current, entry].slice(-UNDO_STACK_LIMIT);
    syncHistoryState();
  }, [syncHistoryState]);

  const onBeforeCommit = useCallback((currentData: TimelineData, options: CommitHistoryOptions) => {
    const now = Date.now();
    const topUndoEntry = undoStackRef.current[undoStackRef.current.length - 1] ?? null;
    const hasMatchingTransaction = Boolean(
      options.transactionId
      && topUndoEntry?.transactionId
      && topUndoEntry.transactionId === options.transactionId,
    );
    const isDebouncedUntransactedEdit = Boolean(
      !options.transactionId
      && !topUndoEntry?.transactionId
      && lastUntransactedEditAtRef.current !== null
      && now - lastUntransactedEditAtRef.current <= UNTRANSACTED_COLLAPSE_WINDOW_MS,
    );
    const isSessionBoundary = Boolean(
      lastEditTimestampRef.current !== null
      && now - lastEditTimestampRef.current > SESSION_IDLE_MS,
    );
    const shouldCreateDistanceCheckpoint =
      editsSinceLastCheckpointRef.current >= EDIT_DISTANCE_CHECKPOINT_THRESHOLD;

    let checkpointTrigger: CheckpointTriggerType | null = null;
    if (isSessionBoundary) {
      checkpointTrigger = 'session_boundary';
    } else if (options.semantic) {
      checkpointTrigger = 'semantic';
    } else if (shouldCreateDistanceCheckpoint) {
      checkpointTrigger = 'edit_distance';
    }

    if (checkpointTrigger) {
      void persistCheckpoint(
        currentData,
        checkpointTrigger,
        editsSinceLastCheckpointRef.current,
      );
      editsSinceLastCheckpointRef.current = 1;
    } else {
      editsSinceLastCheckpointRef.current += 1;
    }

    clearRedoStack();

    if (!hasMatchingTransaction && !isDebouncedUntransactedEdit) {
      pushUndoEntry({
        snapshot: buildSnapshot(currentData),
        timestamp: new Date(now).toISOString(),
        transactionId: options.transactionId,
      });
    }

    lastEditTimestampRef.current = now;
    if (!options.transactionId) {
      lastUntransactedEditAtRef.current = now;
    } else {
      lastUntransactedEditAtRef.current = null;
    }
  }, [clearRedoStack, persistCheckpoint, pushUndoEntry]);

  const undo = useCallback(() => {
    const current = dataRef.current;
    const entry = undoStackRef.current[undoStackRef.current.length - 1];
    if (!current || !entry) {
      return;
    }

    undoStackRef.current = undoStackRef.current.slice(0, -1);
    redoStackRef.current = [
      ...redoStackRef.current,
      {
        snapshot: buildSnapshot(current),
        timestamp: new Date().toISOString(),
      },
    ].slice(-UNDO_STACK_LIMIT);
    syncHistoryState();
    restoreSnapshot(entry.snapshot);
  }, [dataRef, restoreSnapshot, syncHistoryState]);

  const redo = useCallback(() => {
    const current = dataRef.current;
    const entry = redoStackRef.current[redoStackRef.current.length - 1];
    if (!current || !entry) {
      return;
    }

    redoStackRef.current = redoStackRef.current.slice(0, -1);
    undoStackRef.current = [
      ...undoStackRef.current,
      {
        snapshot: buildSnapshot(current),
        timestamp: new Date().toISOString(),
      },
    ].slice(-UNDO_STACK_LIMIT);
    syncHistoryState();
    restoreSnapshot(entry.snapshot);
  }, [dataRef, restoreSnapshot, syncHistoryState]);

  const jumpToCheckpoint = useCallback((checkpointId: string) => {
    const current = dataRef.current;
    const checkpoint = checkpoints.find((entry) => entry.id === checkpointId);
    if (!current || !checkpoint) {
      return;
    }

    undoStackRef.current = [];
    redoStackRef.current = [];
    syncHistoryState();
    restoreSnapshot({
      config: cloneConfig(checkpoint.config),
      signature: checkpoint.id,
    });
    editsSinceLastCheckpointRef.current = 0;
  }, [checkpoints, dataRef, restoreSnapshot, syncHistoryState]);

  const createManualCheckpoint = useCallback(async (label?: string) => {
    const current = dataRef.current;
    if (!current) {
      return;
    }

    await persistCheckpoint(
      current,
      'manual',
      editsSinceLastCheckpointRef.current,
      label,
    );
    editsSinceLastCheckpointRef.current = 0;
  }, [dataRef, persistCheckpoint]);

  useEffect(() => {
    if (!provider.loadCheckpoints) {
      return;
    }

    let cancelled = false;

    void provider.loadCheckpoints(timelineId)
      .then((loadedCheckpoints) => {
        if (cancelled) {
          return;
        }

        setCheckpoints(trimCheckpoints(loadedCheckpoints));
      })
      .catch(() => {
        if (!cancelled) {
          setCheckpoints([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provider, timelineId]);

  return {
    canUndo,
    canRedo,
    checkpoints,
    onBeforeCommit,
    undo,
    redo,
    jumpToCheckpoint,
    createManualCheckpoint,
    createCheckpoint: createManualCheckpoint,
  };
}
