import { memo, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import AssetPanel from '@/tools/video-editor/components/PropertiesPanel/AssetPanel';
import { BulkClipPanel } from '@/tools/video-editor/components/PropertiesPanel/BulkClipPanel';
import { ClipPanel, getVisibleClipTabs, NO_EFFECT } from '@/tools/video-editor/components/PropertiesPanel/ClipPanel';
import {
  useTimelineEditorData,
  useTimelineEditorOps,
} from '@/tools/video-editor/contexts/TimelineEditorContext';
import { useStaleVariants } from '@/tools/video-editor/hooks/useStaleVariants';
import { getBulkVisibleTabs, getSharedNestedValue, getSharedValue } from '@/tools/video-editor/lib/bulk-utils';

function PropertiesPanelComponent() {
  const {
    data,
    resolvedConfig,
    selectedClip,
    selectedClipIds,
    selectedTrack,
    selectedClipHasPredecessor,
    compositionSize,
    preferences,
  } = useTimelineEditorData();
  const {
    clearSelection,
    setSelectedClipId,
    handleUpdateClips,
    handleUpdateClipsDeep,
    handleDeleteClip,
    handleSelectedClipChange,
    handleResetClipPosition,
    handleResetClipsPosition,
    handleToggleMuteClips,
    handleToggleMute,
    handleDetachAudioClip,
    setActiveClipTab,
    patchRegistry,
    registerAsset,
  } = useTimelineEditorOps();
  const { staleAssetKeys, dismissedAssetKeys, dismissAsset, updateAssetToCurrentVariant } = useStaleVariants({
    registry: resolvedConfig?.registry,
    patchRegistry,
    registerAsset,
  });
  const [assetsExpanded, setAssetsExpanded] = useState(false);
  const prevClipIdRef = useRef(selectedClip?.id);
  const selectedClipIdsList = [...selectedClipIds];
  const bulkSelectedClips = resolvedConfig?.clips.filter((clip) => selectedClipIds.has(clip.id)) ?? [];
  const bulkVisibleTabs = getBulkVisibleTabs(bulkSelectedClips, data?.resolvedConfig?.tracks ?? []);
  const bulkEntrance = getSharedNestedValue(bulkSelectedClips, (clip) => clip.entrance);
  const bulkExit = getSharedNestedValue(bulkSelectedClips, (clip) => clip.exit);
  const bulkContinuous = getSharedNestedValue(bulkSelectedClips, (clip) => clip.continuous);
  const bulkText = getSharedNestedValue(bulkSelectedClips, (clip) => clip.text);
  const bulkEntranceType = getSharedValue(bulkSelectedClips.map((clip) => clip.entrance?.type ?? NO_EFFECT));
  const bulkExitType = getSharedValue(bulkSelectedClips.map((clip) => clip.exit?.type ?? NO_EFFECT));
  const bulkContinuousType = getSharedValue(bulkSelectedClips.map((clip) => clip.continuous?.type ?? NO_EFFECT));
  const bulkSpeed = getSharedValue(bulkSelectedClips.map((clip) => clip.speed ?? 1));
  const bulkFrom = getSharedValue(bulkSelectedClips.map((clip) => clip.from ?? 0));
  const bulkTo = getSharedValue(bulkSelectedClips.map((clip) => clip.to ?? clip.assetEntry?.duration ?? 5));
  const bulkX = getSharedValue(bulkSelectedClips.map((clip) => clip.x ?? 0));
  const bulkY = getSharedValue(bulkSelectedClips.map((clip) => clip.y ?? 0));
  const bulkWidth = getSharedValue(bulkSelectedClips.map((clip) => clip.width ?? compositionSize.width));
  const bulkHeight = getSharedValue(bulkSelectedClips.map((clip) => clip.height ?? compositionSize.height));
  const bulkOpacity = getSharedValue(bulkSelectedClips.map((clip) => clip.opacity ?? 1));
  const bulkVolume = getSharedValue(bulkSelectedClips.map((clip) => clip.volume ?? 1));
  const bulkFontSize = getSharedValue(bulkSelectedClips.map((clip) => clip.text?.fontSize ?? 64));
  const bulkTextColor = getSharedValue(bulkSelectedClips.map((clip) => clip.text?.color ?? '#ffffff'));

  useEffect(() => {
    if (selectedClipIds.size > 1) {
      if (!bulkVisibleTabs.includes(preferences.activeClipTab)) {
        setActiveClipTab('effects');
      }
      return;
    }

    const nextVisibleTabs = getVisibleClipTabs(selectedClip, selectedTrack);
    const isClipChange = selectedClip?.id !== prevClipIdRef.current;

    if (isClipChange && selectedClip?.clipType === 'text') {
      setActiveClipTab('text');
    } else if (!nextVisibleTabs.includes(preferences.activeClipTab)) {
      setActiveClipTab('effects');
    }

    prevClipIdRef.current = selectedClip?.id;
  }, [
    bulkVisibleTabs,
    preferences.activeClipTab,
    selectedClip,
    selectedClipIds.size,
    selectedTrack,
    setActiveClipTab,
  ]);

  if (!data) {
    return null;
  }

  const hasSelection = selectedClipIds.size > 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Assets panel — commented out for now
      <div className="overflow-hidden rounded-xl border border-border bg-card/80">
        <button
          type="button"
          className="flex w-full items-center gap-1.5 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={() => setAssetsExpanded((value) => !value)}
        >
          {assetsExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          Assets
        </button>
        {assetsExpanded && (
          <div className="border-t border-border px-3 pb-3">
            <AssetPanel
              assetMap={data.assetMap}
              rows={data.rows}
              meta={data.meta}
              backgroundAsset={data.output.background ?? undefined}
              showAll={preferences.assetPanel.showAll}
              showHidden={preferences.assetPanel.showHidden}
              hidden={preferences.assetPanel.hidden}
              setPanelState={setAssetPanelState}
              onUploadFiles={uploadFiles}
              registry={data.registry.assets}
            />
          </div>
        )}
      </div>
      */}
      <div className={`min-h-0 flex-1 overflow-auto rounded-xl border bg-card/80 p-3 transition-colors ${hasSelection ? 'border-sky-400 ring-1 ring-sky-400/30' : 'border-border'}`}>
        {selectedClipIds.size > 1 ? (
          <BulkClipPanel
            clips={bulkSelectedClips}
            visibleTabs={bulkVisibleTabs}
            compositionWidth={compositionSize.width}
            compositionHeight={compositionSize.height}
            sharedEntrance={bulkEntrance}
            sharedExit={bulkExit}
            sharedContinuous={bulkContinuous}
            sharedText={bulkText}
            sharedEntranceType={bulkEntranceType}
            sharedExitType={bulkExitType}
            sharedContinuousType={bulkContinuousType}
            sharedSpeed={bulkSpeed}
            sharedFrom={bulkFrom}
            sharedTo={bulkTo}
            sharedX={bulkX}
            sharedY={bulkY}
            sharedWidth={bulkWidth}
            sharedHeight={bulkHeight}
            sharedOpacity={bulkOpacity}
            sharedVolume={bulkVolume}
            sharedFontSize={bulkFontSize}
            sharedTextColor={bulkTextColor}
            onChange={(patch) => handleUpdateClips(selectedClipIdsList, patch)}
            onChangeDeep={(patchFn) => handleUpdateClipsDeep(selectedClipIdsList, patchFn)}
            onResetPosition={() => handleResetClipsPosition(selectedClipIdsList)}
            onToggleMute={() => handleToggleMuteClips(selectedClipIdsList)}
            onClose={clearSelection}
            activeTab={preferences.activeClipTab}
            setActiveTab={setActiveClipTab}
          />
        ) : (
          <ClipPanel
            clip={selectedClip}
            track={selectedTrack}
            hasPredecessor={selectedClipHasPredecessor}
            onChange={handleSelectedClipChange}
            onResetPosition={handleResetClipPosition}
            onClose={() => setSelectedClipId(null)}
            onDelete={selectedClip ? () => handleDeleteClip(selectedClip.id) : undefined}
            onToggleMute={handleToggleMute}
            onDetachAudio={selectedClip ? () => handleDetachAudioClip(selectedClip.id) : undefined}
            compositionWidth={compositionSize.width}
            compositionHeight={compositionSize.height}
            activeTab={preferences.activeClipTab}
            setActiveTab={setActiveClipTab}
            isVariantStale={selectedClip?.asset ? staleAssetKeys.has(selectedClip.asset) && !dismissedAssetKeys.has(selectedClip.asset) : false}
            onUpdateVariant={selectedClip?.asset ? () => void updateAssetToCurrentVariant(selectedClip.asset!) : undefined}
            onDismissStale={selectedClip?.asset && staleAssetKeys.has(selectedClip.asset) ? () => dismissAsset(selectedClip.asset!) : undefined}
            timelineFps={resolvedConfig?.output.fps}
          />
        )}
      </div>
    </div>
  );
}

export const PropertiesPanel = memo(PropertiesPanelComponent);
