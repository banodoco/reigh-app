import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, Layers, Music2, Scissors, Trash2, Type } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { ClipMeta } from '@/tools/video-editor/lib/timeline-data';
import type { TimelineAction } from '@/tools/video-editor/types/timeline-canvas';

interface ContextMenuState {
  x: number;
  y: number;
  clientX: number;
}

interface ClipActionProps {
  action: TimelineAction;
  clipMeta: ClipMeta;
  isSelected: boolean;
  isPrimary?: boolean;
  selectedClipIds?: string[];
  thumbnailSrc?: string;
  onSelect: (clipId: string, trackId: string) => void;
  onDoubleClickAsset?: (assetKey: string) => void;
  onSplitHere?: (clipId: string, clientX: number) => void;
  onSplitClipsAtPlayhead?: (clipIds: string[]) => void;
  onDeleteClip?: (clipId: string) => void;
  onDeleteClips?: (clipIds: string[]) => void;
  onToggleMuteClips?: (clipIds: string[]) => void;
}

export function ClipAction({
  action,
  clipMeta,
  isSelected,
  isPrimary = false,
  selectedClipIds = [],
  thumbnailSrc,
  onSelect,
  onDoubleClickAsset,
  onSplitHere,
  onSplitClipsAtPlayhead,
  onDeleteClip,
  onDeleteClips,
  onToggleMuteClips,
}: ClipActionProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeMenu();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu, closeMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isSelected) {
      onSelect(action.id, clipMeta.track);
    }
    setContextMenu({ x: e.clientX, y: e.clientY, clientX: e.clientX });
  }, [action.id, clipMeta.track, isSelected, onSelect]);
  const isEffectLayer = clipMeta.clipType === 'effect-layer';
  const icon = isEffectLayer
    ? <Layers className="h-3 w-3" />
    : clipMeta.clipType === 'text'
    ? <Type className="h-3 w-3" />
    : clipMeta.track.startsWith('A')
      ? <Music2 className="h-3 w-3" />
      : <ImageIcon className="h-3 w-3" />;
  const hasBatchSelection = isSelected && selectedClipIds.length > 1;
  const effectBadges = [
    clipMeta.entrance?.type ? `In:${clipMeta.entrance.type}` : null,
    clipMeta.continuous?.type ? `Loop:${clipMeta.continuous.type}` : null,
    clipMeta.exit?.type ? `Out:${clipMeta.exit.type}` : null,
  ].filter(Boolean);

  return (
    <>
      <button
        type="button"
        className={cn(
          'clip-action group relative flex h-full w-full overflow-hidden rounded-md border text-left',
          isEffectLayer && isSelected
            ? 'border-violet-400 bg-violet-500/20 text-violet-50'
            : isEffectLayer
              ? 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:border-violet-400/60'
            : isSelected
            ? 'border-sky-400 bg-sky-500/20 text-sky-50'
            : 'border-border bg-card/90 text-foreground hover:border-accent',
        )}
        data-clip-id={action.id}
        data-row-id={clipMeta.track}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.stopPropagation();
          if (!isEffectLayer && clipMeta.clipType !== 'text' && clipMeta.asset) {
            onDoubleClickAsset?.(clipMeta.asset);
          }
        }}
        onContextMenu={handleContextMenu}
      >
        {thumbnailSrc ? (
          <img
            src={thumbnailSrc}
            alt=""
            className="h-full w-10 shrink-0 object-cover opacity-80"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-8 shrink-0 items-center justify-center bg-background/60 text-muted-foreground">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1 px-2 py-1">
          <div className="truncate text-[11px] font-medium">
            {isEffectLayer
              ? (clipMeta.continuous?.type || 'Effect Layer')
              : (clipMeta.text?.content || clipMeta.asset || action.id)}
          </div>
          {effectBadges.length > 0 && (
            <div className="mt-1 flex gap-1 overflow-hidden">
              {effectBadges.slice(0, 2).map((badge) => (
                <span key={badge} className="truncate rounded bg-background/60 px-1 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {badge}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      {contextMenu && createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {!hasBatchSelection && onSplitHere && (
            <button
              type="button"
              className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onSplitHere(action.id, contextMenu.clientX);
                closeMenu();
              }}
            >
              <Scissors className="h-4 w-4" />
              Split Here
            </button>
          )}
          {hasBatchSelection && onToggleMuteClips && (
            <button
              type="button"
              className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onToggleMuteClips(selectedClipIds);
                closeMenu();
              }}
            >
              <Music2 className="h-4 w-4" />
              Mute/Unmute {selectedClipIds.length} clips
            </button>
          )}
          {hasBatchSelection && onSplitClipsAtPlayhead && (
            <button
              type="button"
              className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onSplitClipsAtPlayhead(selectedClipIds);
                closeMenu();
              }}
            >
              <Scissors className="h-4 w-4" />
              Split {selectedClipIds.length} clips at playhead
            </button>
          )}
          {hasBatchSelection && onDeleteClips ? (
            <button
              type="button"
              className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => {
                onDeleteClips(selectedClipIds);
                closeMenu();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete {selectedClipIds.length} clips
              <span className="ml-auto text-xs tracking-widest opacity-60">Del</span>
            </button>
          ) : onDeleteClip && (
            <button
              type="button"
              className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => {
                onDeleteClip(action.id);
                closeMenu();
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete Clip
              <span className="ml-auto text-xs tracking-widest opacity-60">Del</span>
            </button>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
