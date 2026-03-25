import type { useAssetManagement } from '@/tools/video-editor/hooks/useAssetManagement';
import type { useClipEditing } from '@/tools/video-editor/hooks/useClipEditing';
import type { useClipResize } from '@/tools/video-editor/hooks/useClipResize';
import type { useTimelineData } from '@/tools/video-editor/hooks/useTimelineData';
import type { useDragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import type { useExternalDrop } from '@/tools/video-editor/hooks/useExternalDrop';
import type { useTimelinePlayback } from '@/tools/video-editor/hooks/useTimelinePlayback';
import type { useTimelineTrackManagement } from '@/tools/video-editor/hooks/useTimelineTrackManagement';

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
  selectedTrackId: TimelineDataHook['selectedTrackId'];
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
  setSelectedTrackId: TimelineDataHook['setSelectedTrackId'];
  setActiveClipTab: TimelineDataHook['setActiveClipTab'];
  setAssetPanelState: TimelineDataHook['setAssetPanelState'];
  registerGenerationAsset: AssetManagementHook['registerGenerationAsset'];
  onCursorDrag: TimelinePlaybackHook['onCursorDrag'];
  onClickTimeArea: TimelinePlaybackHook['onClickTimeArea'];
  onActionResizeStart: ClipResizeHook['onActionResizeStart'];
  onActionResizeEnd: ClipResizeHook['onActionResizeEnd'];
  onChange: ClipEditingHook['onChange'];
  onOverlayChange: ClipEditingHook['onOverlayChange'];
  onTimelineDragOver: ExternalDropHook['onTimelineDragOver'];
  onTimelineDragLeave: ExternalDropHook['onTimelineDragLeave'];
  onTimelineDrop: ExternalDropHook['onTimelineDrop'];
  handleAssetDrop: AssetManagementHook['handleAssetDrop'];
  handleDeleteClip: ClipEditingHook['handleDeleteClip'];
  handleSelectedClipChange: ClipEditingHook['handleSelectedClipChange'];
  handleResetClipPosition: ClipEditingHook['handleResetClipPosition'];
  handleSplitSelectedClip: ClipEditingHook['handleSplitSelectedClip'];
  handleSplitClipAtTime: ClipEditingHook['handleSplitClipAtTime'];
  handleToggleMute: ClipEditingHook['handleToggleMute'];
  handleTrackPopoverChange: TimelineTrackManagementHook['handleTrackPopoverChange'];
  handleReorderTrack: TimelineTrackManagementHook['handleReorderTrack'];
  handleRemoveTrack: TimelineTrackManagementHook['handleRemoveTrack'];
  moveSelectedClipToTrack: TimelineTrackManagementHook['moveSelectedClipToTrack'];
  moveClipToRow: TimelineTrackManagementHook['moveClipToRow'];
  createTrackAndMoveClip: TimelineTrackManagementHook['createTrackAndMoveClip'];
  uploadFiles: TimelineDataHook['uploadFiles'];
  onDoubleClickAsset?: (assetKey: string) => void;
  registerLightboxHandler?: (handler: ((assetKey: string) => void) | null) => void;
}

export interface TimelineChromeContextValue {
  timelineName: string | null;
  saveStatus: TimelineDataHook['saveStatus'];
  renderStatus: TimelineDataHook['renderStatus'];
  renderLog: TimelineDataHook['renderLog'];
  renderDirty: TimelineDataHook['renderDirty'];
  renderProgress: TimelineDataHook['renderProgress'];
  renderResultUrl: TimelineDataHook['renderResultUrl'];
  renderResultFilename: TimelineDataHook['renderResultFilename'];
  setScaleWidth: TimelineDataHook['setScaleWidth'];
  handleAddTrack: TimelineTrackManagementHook['handleAddTrack'];
  handleClearUnusedTracks: TimelineTrackManagementHook['handleClearUnusedTracks'];
  unusedTrackCount: TimelineTrackManagementHook['unusedTrackCount'];
  handleAddText: ClipEditingHook['handleAddText'];
  reloadFromServer: TimelineDataHook['reloadFromServer'];
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
