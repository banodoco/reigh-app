import React from 'react';
import { Ellipsis, Film, Loader2, RefreshCw, Video } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn.ts';
import { shotGroupLabelAttrs } from '@/tools/video-editor/lib/timeline-dom.ts';
import {
  SHOT_GROUP_LABEL_HEIGHT,
  TIME_RULER_HEIGHT,
} from './timeline-canvas-constants.ts';
import { LABEL_WIDTH } from '@/tools/video-editor/lib/coordinate-utils.ts';
import type { CanonicalShotOccurrence } from '@/tools/video-editor/data/shotCompositionAdapter.ts';

export interface PositionedShotGroup {
  key: string;
  shotId: string;
  shotName: string;
  clipIds: string[];
  start: number;
  end: number;
  rowId: string;
  color: string;
  mode?: 'images' | 'video';
  hasFinalVideo: boolean;
  hasManagedOutput?: boolean;
  hasStaleVideo: boolean;
  hasActiveTask: boolean;
  thumbnailSrc?: string;
  left: number;
  top: number;
  width: number;
  height: number;
  canonicalIdentity?: CanonicalShotOccurrence;
}

interface ShotGroupLabelsProps {
  positionedShotGroups: PositionedShotGroup[];
  hidden: boolean;
  showTouchActions: boolean;
  scrollLeft: number;
  scrollTop: number;
  openShotGroupMenu: (clientX: number, clientY: number, group: PositionedShotGroup) => void;
  onSelectClips?: (clipIds: string[]) => void;
  onSelectTrack?: (trackId: string) => void;
  onSelectShotGroup?: (group: PositionedShotGroup) => void;
  selectedCanonicalOccurrenceId?: string | null;
  hoveredShotGroupKey?: string | null;
  onShotGroupNavigate?: (shotId: string) => void;
  onShotGroupOpen?: (occurrence: CanonicalShotOccurrence) => void;
}

interface ShotGroupBordersProps {
  positionedShotGroups: PositionedShotGroup[];
  hidden: boolean;
}

export const ShotGroupLabels = React.memo(function ShotGroupLabels({
  positionedShotGroups,
  hidden,
  showTouchActions,
  scrollLeft,
  scrollTop,
  openShotGroupMenu,
  onSelectClips,
  onSelectTrack,
  onSelectShotGroup,
  selectedCanonicalOccurrenceId,
  hoveredShotGroupKey,
  onShotGroupNavigate,
  onShotGroupOpen,
}: ShotGroupLabelsProps) {
  if (hidden) {
    return null;
  }

  return (
    <>
      {positionedShotGroups.map((group) => {
        const labelLeft = group.left - scrollLeft;
        const clippedLeft = Math.max(0, LABEL_WIDTH - labelLeft);
        const isSelectedCanonical = Boolean(
          group.canonicalIdentity
          && selectedCanonicalOccurrenceId === group.canonicalIdentity.occurrenceId,
        );
        const isHovered = hoveredShotGroupKey === group.key;
        return (
          <div
            key={`${group.key}:label`}
            className={cn(
              'group/shot-label absolute overflow-hidden hover:z-10 focus-within:z-10 hover:h-[18px] focus-within:h-[18px] hover:translate-y-0 focus-within:translate-y-0 hover:opacity-100 focus-within:opacity-100 cursor-pointer select-none rounded-t-sm transition-opacity',
              isHovered ? 'z-10 h-[18px] translate-y-0 opacity-100' : 'z-[1] h-1 translate-y-[14px] opacity-70',
            )}
            data-shot-group-key={group.key}
            title={group.shotName}
            aria-pressed={isSelectedCanonical}
            {...shotGroupLabelAttrs(group.clipIds[0] ?? group.canonicalIdentity?.occurrenceId ?? '', group.rowId)}
            onClick={(event) => {
              event.stopPropagation();
              if (onSelectShotGroup) {
                onSelectShotGroup(group);
              } else {
                onSelectTrack?.(group.rowId);
                onSelectClips?.(group.canonicalIdentity
                  ? [group.canonicalIdentity.occurrenceId]
                  : group.clipIds);
              }
            }}
            onDoubleClick={(event) => {
              event.stopPropagation();
              if (group.canonicalIdentity && onShotGroupOpen) {
                if (onSelectShotGroup) onSelectShotGroup(group);
                else {
                  onSelectTrack?.(group.rowId);
                  onSelectClips?.([group.canonicalIdentity.occurrenceId]);
                }
                onShotGroupOpen(group.canonicalIdentity);
                return;
              }
              if (onShotGroupNavigate) {
                onShotGroupNavigate(group.shotId);
                return;
              }
              onSelectClips?.(group.clipIds);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openShotGroupMenu(event.clientX, event.clientY, group);
            }}
            style={{
              left: labelLeft,
              top: TIME_RULER_HEIGHT + group.top - SHOT_GROUP_LABEL_HEIGHT - scrollTop,
              width: group.width,
              // Idle labels sit behind clip slots; hover/focus raises them
              // above clips, still below the sticky track-label column.
              // Clip the scrolled portion as well so it cannot intercept the
              // reorder/settings controls at the left edge of the timeline.
              pointerEvents: 'auto',
              ...(clippedLeft > 0 ? { clipPath: `inset(0 0 0 ${Math.min(clippedLeft, group.width)}px)` } : {}),
              background: `color-mix(in srgb, ${group.color} 78%, transparent)`,
            }}
          >
            <span
              className={cn('pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 truncate text-[10px] font-medium group-hover/shot-label:opacity-100 group-focus-within/shot-label:opacity-100', !isHovered && 'opacity-0')}
              style={{ color: `color-mix(in srgb, white 92%, ${group.color})` }}
            >
              {group.shotName}
            </span>
            <div className={cn('pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1 group-hover/shot-label:opacity-100 group-focus-within/shot-label:opacity-100', !isHovered && 'opacity-0')}>
              {showTouchActions && (
                <button
                  type="button"
                  className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-card/90 text-foreground shadow-sm transition-colors hover:bg-accent"
                  title="Open shot actions"
                  aria-label={`Open actions for ${group.shotName}`}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openShotGroupMenu(event.clientX, event.clientY, group);
                  }}
                >
                  <Ellipsis className="h-4 w-4" />
                </button>
              )}
              {group.hasFinalVideo && (
                <button
                  type="button"
                  className="pointer-events-auto flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm transition-transform hover:scale-110 hover:bg-sky-400"
                  title="Final video available"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openShotGroupMenu(event.clientX, event.clientY, { ...group, hasFinalVideo: true });
                  }}
                >
                  <Video className="h-2.5 w-2.5" />
                </button>
              )}
              {group.hasStaleVideo && !group.hasActiveTask && (
                <button
                  type="button"
                  className="pointer-events-auto flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white shadow-sm transition-transform hover:scale-110 hover:bg-amber-400"
                  title="New video available"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openShotGroupMenu(event.clientX, event.clientY, group);
                  }}
                >
                  <RefreshCw className="h-2.5 w-2.5" />
                </button>
              )}
              {group.hasActiveTask && (
                <div
                  className="flex h-4 w-4 items-center justify-center rounded-full shadow-sm"
                  title="Task in progress"
                  style={{ backgroundColor: 'rgba(255,255,255,0.9)' }}
                >
                  <Loader2 className="h-2.5 w-2.5 animate-spin" style={{ color: group.color }} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
});

export const ShotGroupBorders = React.memo(function ShotGroupBorders({
  positionedShotGroups,
  hidden,
}: ShotGroupBordersProps) {
  if (hidden) {
    return null;
  }

  return (
    <>
      {positionedShotGroups.map((group) => (
        <React.Fragment key={group.key}>
          {group.thumbnailSrc && (
            <div
              className="pointer-events-none absolute overflow-hidden rounded-md"
              aria-hidden="true"
              style={{
                left: group.left,
                top: group.top,
                width: group.width,
                height: group.height,
                zIndex: 0,
                opacity: 0.58,
              }}
            >
              <img src={group.thumbnailSrc} alt="" className="h-full w-full object-cover" draggable={false} />
              <div className="absolute inset-0 bg-black/25" />
            </div>
          )}
          {group.canonicalIdentity && !group.thumbnailSrc && (
            <div
              className="pointer-events-none absolute flex items-center justify-center rounded-md bg-black/20 text-white/50"
              title="No canonical poster available"
              aria-hidden="true"
              style={{
                left: group.left,
                top: group.top,
                width: group.width,
                height: group.height,
                zIndex: 0,
              }}
            >
              <Film className="h-4 w-4" />
            </div>
          )}
          <div
            className="pointer-events-none absolute rounded-md border-2 border-solid transition-colors"
            style={{
              left: group.left - 2,
              top: group.top - 2,
              width: group.width + 4,
              height: group.height + 4,
              zIndex: 1,
              borderColor: `color-mix(in srgb, ${group.color} 60%, transparent)`,
            }}
          />
          {/*
            The dedicated round overlay edge handles were removed: they
            visually overlapped (and z-index-blocked) the first/last
            child clip's outer-edge resize handles, intercepting pointer
            events. The clip handles now route those gestures through
            `handleResizePointerDown`, providing a single unified
            affordance.
          */}
        </React.Fragment>
      ))}
    </>
  );
});
