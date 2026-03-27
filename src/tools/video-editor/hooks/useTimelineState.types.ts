import type { useAssetManagement } from '@/tools/video-editor/hooks/useAssetManagement';
import type { useClipEditing } from '@/tools/video-editor/hooks/useClipEditing';
import type { useClipResize } from '@/tools/video-editor/hooks/useClipResize';
import type { useTimelineData } from '@/tools/video-editor/hooks/useTimelineData';
import type { useDragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import type { useExternalDrop } from '@/tools/video-editor/hooks/useExternalDrop';
import type { useTimelinePlayback } from '@/tools/video-editor/hooks/useTimelinePlayback';
import type { useTimelineTrackManagement } from '@/tools/video-editor/hooks/useTimelineTrackManagement';
import type { UseMultiSelectResult } from '@/tools/video-editor/hooks/useMultiSelect';

type TimelineDataHook = ReturnType<typeof useTimelineData>;
type DragCoordinatorHook = ReturnType<typeof useDragCoordinator>;
type TimelinePlaybackHook = ReturnType<typeof useTimelinePlayback>;
type TimelineTrackManagementHook = ReturnType<typeof useTimelineTrackManagement>;
type AssetManagementHook = ReturnType<typeof useAssetManagement>;
type ClipResizeHook = ReturnType<typeof useClipResize>;
type ClipEditingHook = ReturnType<typeof useClipEditing>;
type ExternalDropHook = ReturnType<typeof useExternalDrop>;

export interface TimelineEditorContextValue {
  data: TimelineDataHook['data'];
  resolvedConfig: TimelineDataHook['resolvedConfig'];
  selectedClipId: TimelineDataHook['selectedClipId'];
  selectedClipIds: UseMultiSelectResult['selectedClipIds'];
  selectedClipIdsRef: UseMultiSelectResult['selectedClipIdsRef'];
  selectedTrackId: TimelineDataHook['selectedTrackId'];
  primaryClipId: UseMultiSelectResult['primaryClipId'];
  selectedClip: TimelineDataHook['selectedClip'];
  selectedTrack: TimelineDataHook['selectedTrack'];
  selectedClipHasPredecessor: boolean;
  compositionSize: TimelineDataHook['compositionSize'];
  trackScaleMap: TimelineDataHook['trackScaleMap'];
  scale: number;
  scaleWidth: number;
  isLoading: boolean;
  dataRef: TimelineDataHook['dataRef'];
  coordinator: DragCoordinatorHook['coordinator'];
  indicatorRef: DragCoordinatorHook['indicatorRef'];
  editAreaRef: DragCoordinatorHook['editAreaRef'];
  preferences: TimelineDataHook['preferences'];
  timelineRef: TimelinePlaybackHook['timelineRef'];
  timelineWrapperRef: TimelinePlaybackHook['timelineWrapperRef'];
  setSelectedClipId: TimelineDataHook['setSelectedClipId'];
  isClipSelected: UseMultiSelectResult['isClipSelected'];
  selectClip: UseMultiSelectResult['selectClip'];
  selectClips: UseMultiSelectResult['selectClips'];
  addToSelection: UseMultiSelectResult['addToSelection'];
  clearSelection: UseMultiSelectResult['clearSelection'];
  setSelectedTrackId: TimelineDataHook['setSelectedTrackId'];
  setActiveClipTab: TimelineDataHook['setActiveClipTab'];
  setAssetPanelState: TimelineDataHook['setAssetPanelState'];
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
  uploadFiles: TimelineDataHook['uploadFiles'];
  applyTimelineEdit: TimelineDataHook['applyTimelineEdit'];
  onDoubleClickAsset?: (assetKey: string) => void;
  registerLightboxHandler?: (handler: ((assetKey: string) => void) | null) => void;
}

export interface TimelineChromeContextValue {
  timelineName: string | null;
  saveStatus: TimelineDataHook['saveStatus'];
  isConflictExhausted: TimelineDataHook['isConflictExhausted'];
  renderStatus: TimelineDataHook['renderStatus'];
  renderLog: TimelineDataHook['renderLog'];
  renderDirty: TimelineDataHook['renderDirty'];
  renderProgress: TimelineDataHook['renderProgress'];
  renderResultUrl: TimelineDataHook['renderResultUrl'];
  renderResultFilename: TimelineDataHook['renderResultFilename'];
  undo: TimelineDataHook['undo'];
  redo: TimelineDataHook['redo'];
  canUndo: TimelineDataHook['canUndo'];
  canRedo: TimelineDataHook['canRedo'];
  checkpoints: TimelineDataHook['checkpoints'];
  jumpToCheckpoint: TimelineDataHook['jumpToCheckpoint'];
  createManualCheckpoint: TimelineDataHook['createManualCheckpoint'];
  setScaleWidth: TimelineDataHook['setScaleWidth'];
  handleAddTrack: TimelineTrackManagementHook['handleAddTrack'];
  handleClearUnusedTracks: TimelineTrackManagementHook['handleClearUnusedTracks'];
  unusedTrackCount: TimelineTrackManagementHook['unusedTrackCount'];
  handleAddText: ClipEditingHook['handleAddText'];
  handleAddTextAt: ClipEditingHook['handleAddTextAt'];
  reloadFromServer: TimelineDataHook['reloadFromServer'];
  retrySaveAfterConflict: TimelineDataHook['retrySaveAfterConflict'];
  startRender: TimelineDataHook['startRender'];
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
