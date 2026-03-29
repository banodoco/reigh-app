import { useQueryClient } from '@tanstack/react-query';
import { useLayoutEffect, useRef } from 'react';
import { useAssetOperations } from '@/tools/video-editor/hooks/useAssetOperations';
import { useDerivedTimeline } from '@/tools/video-editor/hooks/useDerivedTimeline';
import { useEditorPreferences } from '@/tools/video-editor/hooks/useEditorPreferences';
import type { ClipTab, EditorPreferences } from '@/tools/video-editor/hooks/useEditorPreferences';
import { useRenderState } from '@/tools/video-editor/hooks/useRenderState';
import type { RenderStatus } from '@/tools/video-editor/hooks/useRenderState';
import { useTimelineHistory } from '@/tools/video-editor/hooks/useTimelineHistory';
import { useTimelineQueries } from '@/tools/video-editor/hooks/useTimelineQueries';
import { useTimelineSave } from '@/tools/video-editor/hooks/useTimelineSave';
import type { SaveStatus } from '@/tools/video-editor/hooks/useTimelineSave';
import { useVideoEditorRuntime } from '@/tools/video-editor/contexts/DataProviderContext';
import type { ClipMeta, ClipOrderMap, TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
import type { AssetRegistryEntry, TrackDefinition } from '@/tools/video-editor/types';
import type { Checkpoint } from '@/tools/video-editor/types/history';

export type { SaveStatus } from './useTimelineSave';
export { shouldAcceptPolledData } from './useTimelineSave';
export type { RenderStatus } from './useRenderState';
export type { ClipTab, EditorPreferences } from './useEditorPreferences';

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
  isConflictExhausted: boolean;
  renderStatus: RenderStatus;
  renderLog: string;
  renderDirty: boolean;
  renderProgress: { current: number; total: number; percent: number; phase: string } | null;
  renderResultUrl: string | null;
  renderResultFilename: string | null;
  canUndo: boolean;
  canRedo: boolean;
  checkpoints: Checkpoint[];
  scale: number;
  scaleWidth: number;
  isLoading: boolean;
  dataRef: React.MutableRefObject<TimelineData | null>;
  pruneSelectionRef: React.MutableRefObject<((validIds: Set<string>) => void) | null>;
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
    options?: { save?: boolean; transactionId?: string; semantic?: boolean },
  ) => void;
  applyResolvedConfigEdit: (
    nextResolvedConfig: TimelineData['resolvedConfig'],
    options?: { selectedClipId?: string | null; selectedTrackId?: string | null; semantic?: boolean },
  ) => void;
  patchRegistry: (assetId: string, entry: AssetRegistryEntry, src?: string) => void;
  registerAsset: (assetId: string, entry: AssetRegistryEntry) => Promise<void>;
  queryClient: ReturnType<typeof useQueryClient>;
  uploadAsset: (file: File) => Promise<{ assetId: string; entry: AssetRegistryEntry }>;
  uploadFiles: (files: File[]) => Promise<void>;
  invalidateAssetRegistry: () => Promise<void>;
  reloadFromServer: () => Promise<void>;
  retrySaveAfterConflict: () => Promise<void>;
  startRender: () => Promise<void>;
  undo: () => void;
  redo: () => void;
  jumpToCheckpoint: (checkpointId: string) => void;
  createManualCheckpoint: (label?: string) => Promise<void>;
}

export function useTimelineData(): UseTimelineDataResult {
  const queryClient = useQueryClient();
  const { provider, timelineId, userId } = useVideoEditorRuntime();
  const prefs = useEditorPreferences(timelineId);
  const queries = useTimelineQueries(provider, timelineId);
  const onSaveSuccessRef = useRef<(() => void) | null>(null);
  const pruneSelectionRef = useRef<((validIds: Set<string>) => void) | null>(null);
  const save = useTimelineSave(queries, provider, onSaveSuccessRef, pruneSelectionRef);
  const history = useTimelineHistory({
    dataRef: save.dataRef,
    commitData: save.commitData,
  });
  const derived = useDerivedTimeline(save.data, save.selectedClipId, save.selectedTrackId);
  const render = useRenderState(derived.resolvedConfig, derived.renderMetadata);
  const assets = useAssetOperations(provider, timelineId, userId, queryClient, save.pendingOpsRef);
  onSaveSuccessRef.current = () => render.setRenderDirty(true);

  useLayoutEffect(() => {
    save.onBeforeCommitRef.current = history.onBeforeCommit;

    return () => {
      if (save.onBeforeCommitRef.current === history.onBeforeCommit) {
        save.onBeforeCommitRef.current = null;
      }
    };
  }, [history.onBeforeCommit, save.onBeforeCommitRef]);

  return {
    data: save.data,
    resolvedConfig: derived.resolvedConfig,
    selectedClipId: save.selectedClipId,
    selectedTrackId: save.selectedTrackId,
    selectedClip: derived.selectedClip,
    selectedTrack: derived.selectedTrack,
    selectedClipHasPredecessor: derived.selectedClipHasPredecessor,
    compositionSize: derived.compositionSize,
    trackScaleMap: derived.trackScaleMap,
    saveStatus: save.saveStatus,
    isConflictExhausted: save.isConflictExhausted,
    renderStatus: render.renderStatus,
    renderLog: render.renderLog,
    renderDirty: render.renderDirty,
    renderProgress: render.renderProgress,
    renderResultUrl: render.renderResultUrl,
    renderResultFilename: render.renderResultFilename,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    checkpoints: history.checkpoints,
    scale: prefs.scale,
    scaleWidth: prefs.scaleWidth,
    isLoading: save.isLoading,
    dataRef: save.dataRef,
    pruneSelectionRef,
    preferences: prefs.preferences,
    setSelectedClipId: save.setSelectedClipId,
    setSelectedTrackId: save.setSelectedTrackId,
    setRenderStatus: render.setRenderStatus,
    setRenderLog: render.setRenderLog,
    setRenderDirty: render.setRenderDirty,
    setScaleWidth: prefs.setScaleWidth,
    setActiveClipTab: prefs.setActiveClipTab,
    setAssetPanelState: prefs.setAssetPanelState,
    applyTimelineEdit: save.applyTimelineEdit,
    applyResolvedConfigEdit: save.applyResolvedConfigEdit,
    patchRegistry: save.patchRegistry,
    registerAsset: assets.registerAsset,
    queryClient,
    uploadAsset: assets.uploadAsset,
    uploadFiles: assets.uploadFiles,
    invalidateAssetRegistry: assets.invalidateAssetRegistry,
    reloadFromServer: save.reloadFromServer,
    retrySaveAfterConflict: save.retrySaveAfterConflict,
    startRender: render.startRender,
    undo: history.undo,
    redo: history.redo,
    jumpToCheckpoint: history.jumpToCheckpoint,
    createManualCheckpoint: history.createManualCheckpoint,
  };
}
