import { useMemo } from 'react';
import { Button } from '@/shared/components/ui/button.tsx';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import {
  useTimelineEditorData,
  useTimelineEditorOps,
  useTimelinePlaybackContext,
} from '@/tools/video-editor/hooks/timelineStore.ts';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';

export interface TimelineOutlineItem {
  id: string;
  trackId: string;
  trackLabel: string;
  clipType: string;
  label: string;
  start: number;
  end: number;
  assetKey?: string;
}

/**
 * The outline is deliberately a projection of the editor's resolved config.
 * It has no second document or cache: selection and media actions go back
 * through the same editor store used by the canvas.
 */
export function buildTimelineOutlineItems(
  config: ResolvedTimelineConfig | null | undefined,
): TimelineOutlineItem[] {
  if (!config) return [];

  const trackLabels = new Map(config.tracks.map((track) => [track.id, track.label]));
  return [...config.clips]
    .map((clip) => ({
      id: clip.id,
      trackId: clip.track,
      trackLabel: trackLabels.get(clip.track) ?? clip.track,
      clipType: clip.clipType,
      label: clip.label?.trim() || clip.text?.content?.trim() || clip.clipType,
      start: clip.start,
      end: clip.end,
      ...(clip.asset ? { assetKey: clip.asset } : {}),
    }))
    .sort((left, right) => left.start - right.start || left.trackId.localeCompare(right.trackId) || left.id.localeCompare(right.id));
}

export function formatOutlineTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
}

export function TimelineOutlinePanel() {
  const { resolvedConfig, selectedClip, selectedClipIds } = useTimelineEditorData();
  const { currentTime, previewRef } = useTimelinePlaybackContext();
  const { selectClip, setSelectedTrackId, setInspectorTarget, onDoubleClickAsset } = useTimelineEditorOps();
  const items = useMemo(() => buildTimelineOutlineItems(resolvedConfig), [resolvedConfig]);
  const selectedItem = selectedClip ? items.find((item) => item.id === selectedClip.id) : undefined;

  const focusItem = (item: TimelineOutlineItem) => {
    selectClip(item.id);
    setSelectedTrackId(item.trackId);
    setInspectorTarget({ kind: 'clip', clipId: item.id });
    previewRef?.current?.seek(item.start);
  };

  if (!resolvedConfig) return null;

  return (
    <div data-testid="timeline-outline-panel" className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="rounded-xl border border-border bg-card/80 p-3">
        <div className="text-sm font-medium text-foreground">Timeline outline</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Same current timeline as the canvas. Select an item to focus its time and details.
        </p>
        <div className="mt-2 text-[11px] text-muted-foreground">
          {items.length} {items.length === 1 ? 'item' : 'items'} · playhead {formatOutlineTime(currentTime)}
        </div>
      </div>

      <div data-testid="timeline-outline-list" className="min-h-0 flex-1 space-y-1 overflow-auto">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
            This timeline has no clips yet.
          </div>
        ) : items.map((item) => {
          const isSelected = selectedClipIds.has(item.id);
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={isSelected}
              data-testid={`timeline-outline-item-${item.id}`}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                isSelected
                  ? 'border-sky-400/70 bg-sky-500/10 text-foreground'
                  : 'border-border/70 text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
              onClick={() => focusItem(item)}
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="min-w-0 truncate font-medium">{item.label}</span>
                <span className="shrink-0 font-mono text-[10px]">{formatOutlineTime(item.start)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-[10px]">
                <span className="truncate">{item.trackLabel} · {item.clipType}</span>
                <span className="shrink-0 font-mono">{formatOutlineTime(item.end)}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div data-testid="timeline-outline-details" className="rounded-xl border border-border bg-card/80 p-3">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Details</div>
        {selectedItem ? (
          <>
            <div className="mt-2 text-sm font-medium text-foreground">{selectedItem.label}</div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-muted-foreground">range</dt>
              <dd className="font-mono">{formatOutlineTime(selectedItem.start)}–{formatOutlineTime(selectedItem.end)}</dd>
              <dt className="text-muted-foreground">track</dt>
              <dd>{selectedItem.trackLabel}</dd>
              <dt className="text-muted-foreground">id</dt>
              <dd className="break-all font-mono">{selectedItem.id}</dd>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => focusItem(selectedItem)}>
                Focus at start
              </Button>
              {selectedItem.assetKey && onDoubleClickAsset && (
                <Button type="button" size="sm" variant="outline" onClick={() => onDoubleClickAsset(selectedItem.assetKey!, selectedItem.id)}>
                  Open media
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Select a clip to inspect its timing and media identity.</p>
        )}
      </div>
    </div>
  );
}
