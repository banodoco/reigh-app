import type { useAssetManagement } from '@/tools/video-editor/hooks/useAssetManagement';
import type { useClipEditing } from '@/tools/video-editor/hooks/useClipEditing';
import type { useClipResize } from '@/tools/video-editor/hooks/useClipResize';
import type { useDragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import type { useExternalDrop } from '@/tools/video-editor/hooks/useExternalDrop';
import type { useTimelinePlayback } from '@/tools/video-editor/hooks/useTimelinePlayback';
import type { useTimelineTrackManagement } from '@/tools/video-editor/hooks/useTimelineTrackManagement';
import type {
  EditorPreferences,
  RenderStatus,
  SaveStatus,
  TimelineApplyEdit,
  TimelineCheckpoints,
  TimelineCreateManualCheckpoint,
  TimelineDataRef,
  TimelineJumpToCheckpoint,
  TimelinePatchRegistry,
  TimelinePendingOpsRef,
  TimelineRegisterAsset,
  TimelineReloadFromServer,
  TimelineRenderProgress,
  TimelineResolvedConfig,
  TimelineRetrySaveAfterConflict,
  TimelineSelectedClip,
  TimelineSelectedTrack,
  TimelineSetActiveClipTab,
  TimelineSetAssetPanelState,
  TimelineSetScaleWidth,
  TimelineSetSelectedClipId,
  TimelineSetSelectedTrackId,
  TimelineStartRender,
  TimelineUploadFiles,
} from '@/tools/video-editor/hooks/useTimelineData.types';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { UseMultiSelectResult } from '@/tools/video-editor/hooks/useMultiSelect';

type DragCoordinatorHook = ReturnType<typeof useDragCoordinator>;
type TimelinePlaybackHook = ReturnType<typeof useTimelinePlayback>;
type TimelineTrackManagementHook = ReturnType<typeof useTimelineTrackManagement>;
type AssetManagementHook = ReturnType<typeof useAssetManagement>;
type ClipResizeHook = ReturnType<typeof useClipResize>;
type ClipEditingHook = ReturnType<typeof useClipEditing>;
type ExternalDropHook = ReturnType<typeof useExternalDrop>;

export interface TimelineEditorDataContextValue {
  data: TimelineData | null;
  resolvedConfig: TimelineResolvedConfig;
  selectedClipId: string | null;
  selectedClipIds: UseMultiSelectResult['selectedClipIds'];
  selectedClipIdsRef: UseMultiSelectResult['selectedClipIdsRef'];
  selectedTrackId: string | null;
  primaryClipId: UseMultiSelectResult['primaryClipId'];
  selectedClip: TimelineSelectedClip;
  selectedTrack: TimelineSelectedTrack;
  selectedClipHasPredecessor: boolean;
  compositionSize: { width: number; height: number };
  trackScaleMap: Record<string, number>;
  scale: number;
  scaleWidth: number;
  isLoading: boolean;
  dataRef: TimelineDataRef;
  pendingOpsRef: TimelinePendingOpsRef;
  coordinator: DragCoordinatorHook['coordinator'];
  indicatorRef: DragCoordinatorHook['indicatorRef'];
  editAreaRef: DragCoordinatorHook['editAreaRef'];
  preferences: EditorPreferences;
  timelineRef: TimelinePlaybackHook['timelineRef'];
  timelineWrapperRef: TimelinePlaybackHook['timelineWrapperRef'];
}

export interface TimelineEditorOpsContextValue {
  setSelectedClipId: TimelineSetSelectedClipId;
  isClipSelected: UseMultiSelectResult['isClipSelected'];
  selectClip: UseMultiSelectResult['selectClip'];
  selectClips: UseMultiSelectResult['selectClips'];
  addToSelection: UseMultiSelectResult['addToSelection'];
  clearSelection: UseMultiSelectResult['clearSelection'];
  setSelectedTrackId: TimelineSetSelectedTrackId;
  setActiveClipTab: TimelineSetActiveClipTab;
  setAssetPanelState: TimelineSetAssetPanelState;
  registerGenerationAsset: AssetManagementHook['registerGenerationAsset'];
  onCursorDrag: TimelinePlaybackHook['onCursorDrag'];
  onClickTimeArea: TimelinePlaybackHook['onClickTimeArea'];
  onActionResizeStart: ClipResizeHook['onActionResizeStart'];
  onActionResizeEnd: ClipResizeHook['onActionResizeEnd'];
  onOverlayChange: ClipEditingHook['onOverlayChange'];
  onTimelineDragOver: ExternalDropHook['onTimelineDragOver'];
  onTimelineDragLeave: ExternalDropHook['onTimelineDragLeave'];
  onTimelineDrop: ExternalDropHook['onTimelineDrop'];
  handleAssetDrop: AssetManagementHook['handleAssetDrop'];
  handleUpdateClips: ClipEditingHook['handleUpdateClips'];
  handleUpdateClipsDeep: ClipEditingHook['handleUpdateClipsDeep'];
  handleDeleteClips: ClipEditingHook['handleDeleteClips'];
  handleDeleteClip: ClipEditingHook['handleDeleteClip'];
  handleSelectedClipChange: ClipEditingHook['handleSelectedClipChange'];
  handleResetClipPosition: ClipEditingHook['handleResetClipPosition'];
  handleResetClipsPosition: ClipEditingHook['handleResetClipsPosition'];
  handleSplitSelectedClip: ClipEditingHook['handleSplitSelectedClip'];
  handleSplitClipAtTime: ClipEditingHook['handleSplitClipAtTime'];
  handleSplitClipsAtPlayhead: ClipEditingHook['handleSplitClipsAtPlayhead'];
  handleToggleMuteClips: ClipEditingHook['handleToggleMuteClips'];
  handleToggleMute: ClipEditingHook['handleToggleMute'];
  handleTrackPopoverChange: TimelineTrackManagementHook['handleTrackPopoverChange'];
  handleMoveTrack: TimelineTrackManagementHook['handleMoveTrack'];
  handleRemoveTrack: TimelineTrackManagementHook['handleRemoveTrack'];
  moveSelectedClipToTrack: TimelineTrackManagementHook['moveSelectedClipToTrack'];
  moveSelectedClipsToTrack: TimelineTrackManagementHook['moveSelectedClipsToTrack'];
  moveClipToRow: TimelineTrackManagementHook['moveClipToRow'];
  createTrackAndMoveClip: TimelineTrackManagementHook['createTrackAndMoveClip'];
  uploadFiles: TimelineUploadFiles;
  applyEdit: TimelineApplyEdit;
  patchRegistry: TimelinePatchRegistry;
  registerAsset: TimelineRegisterAsset;
  onDoubleClickAsset?: (assetKey: string) => void;
  registerLightboxHandler?: (handler: ((assetKey: string) => void) | null) => void;
}

/**
 * @deprecated Prefer `TimelineEditorDataContextValue` and `TimelineEditorOpsContextValue`.
 */
export interface TimelineEditorContextValue extends TimelineEditorDataContextValue, TimelineEditorOpsContextValue {}

export interface TimelineChromeContextValue {
  timelineName: string | null;
  saveStatus: SaveStatus;
  isConflictExhausted: boolean;
  renderStatus: RenderStatus;
  renderLog: string;
  renderDirty: boolean;
  renderProgress: TimelineRenderProgress;
  renderResultUrl: string | null;
  renderResultFilename: string | null;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  checkpoints: TimelineCheckpoints;
  jumpToCheckpoint: TimelineJumpToCheckpoint;
  createManualCheckpoint: TimelineCreateManualCheckpoint;
  setScaleWidth: TimelineSetScaleWidth;
  handleAddTrack: TimelineTrackManagementHook['handleAddTrack'];
  handleClearUnusedTracks: TimelineTrackManagementHook['handleClearUnusedTracks'];
  unusedTrackCount: TimelineTrackManagementHook['unusedTrackCount'];
  handleAddText: ClipEditingHook['handleAddText'];
  handleAddTextAt: ClipEditingHook['handleAddTextAt'];
  reloadFromServer: TimelineReloadFromServer;
  retrySaveAfterConflict: TimelineRetrySaveAfterConflict;
  startRender: TimelineStartRender;
}

export interface TimelinePlaybackContextValue {
  currentTime: number;
  previewRef: TimelinePlaybackHook['previewRef'];
  playerContainerRef: TimelinePlaybackHook['playerContainerRef'];
  onPreviewTimeUpdate: TimelinePlaybackHook['onPreviewTimeUpdate'];
  formatTime: TimelinePlaybackHook['formatTime'];
}

export interface UseTimelineStateResult {
  editor: TimelineEditorContextValue;
  chrome: TimelineChromeContextValue;
  playback: TimelinePlaybackContextValue;
}
