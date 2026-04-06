import { createPortal } from 'react-dom';
import { ArrowRight, Clapperboard, Video, X } from 'lucide-react';

export type ShotGroupMenuState = {
  x: number;
  y: number;
  shotId: string;
  shotName: string;
  clipIds: string[];
  rowId: string;
  trackId: string;
  hasFinalVideo: boolean;
  mode?: 'images' | 'video';
} | null;

interface ShotGroupContextMenuProps {
  menu: ShotGroupMenuState;
  menuRef: React.RefObject<HTMLDivElement | null>;
  closeMenu: () => void;
  onNavigate?: (shotId: string) => void;
  onGenerateVideo?: (shotId: string) => void;
  onSwitchToFinalVideo?: (group: { shotId: string; clipIds: string[]; rowId: string }) => void;
  onSwitchToImages?: (group: { shotId: string; rowId: string }) => void;
  onUnpinGroup?: (group: { shotId: string; trackId: string }) => void;
}

export function ShotGroupContextMenu({
  menu,
  menuRef,
  closeMenu,
  onNavigate,
  onGenerateVideo,
  onSwitchToFinalVideo,
  onSwitchToImages,
  onUnpinGroup,
}: ShotGroupContextMenuProps) {
  if (!menu) {
    return null;
  }

  const pinActions = [
    onUnpinGroup
      ? {
          key: 'unpin-shot-group',
          label: 'Remove from timeline',
          icon: X,
          onClick: () => onUnpinGroup({ shotId: menu.shotId, trackId: menu.trackId }),
        }
      : null,
  ].filter((action): action is { key: string; label: string; icon: typeof Video; onClick: () => void } => Boolean(action));
  const finalVideoActions = menu.hasFinalVideo && menu.mode !== 'video'
    ? [
      onSwitchToFinalVideo
        ? {
          key: 'switch-final-video',
          label: 'Switch to Final Video',
          icon: Video,
          onClick: () => onSwitchToFinalVideo({ shotId: menu.shotId, clipIds: menu.clipIds, rowId: menu.rowId }),
        }
        : null,
    ].filter((action): action is { key: string; label: string; icon: typeof Video; onClick: () => void } => Boolean(action))
    : [];
  const imageActions = menu.mode === 'video'
    ? [
      onSwitchToImages
        ? {
            key: 'switch-images',
            label: 'Switch to Images',
            icon: Video,
            onClick: () => onSwitchToImages({ shotId: menu.shotId, rowId: menu.rowId }),
          }
        : null,
    ].filter((action): action is { key: string; label: string; icon: typeof Video; onClick: () => void } => Boolean(action))
    : [];
  const defaultActions = [
    onNavigate
      ? { key: 'jump-to-shot', label: 'Jump to Shot', icon: ArrowRight, onClick: () => onNavigate(menu.shotId) }
      : null,
    onGenerateVideo
      ? { key: 'generate-video', label: 'Generate Video', icon: Clapperboard, onClick: () => onGenerateVideo(menu.shotId) }
      : null,
  ].filter((action): action is { key: string; label: string; icon: typeof Video; onClick: () => void } => Boolean(action));

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: menu.x, top: menu.y }}
    >
      <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{menu.shotName}</div>
      {pinActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            type="button"
            className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => { action.onClick(); closeMenu(); }}
          >
            <Icon className="h-4 w-4" />
            {action.label}
          </button>
        );
      })}
      {pinActions.length > 0 && (finalVideoActions.length > 0 || imageActions.length > 0 || defaultActions.length > 0) && <div className="my-1 h-px bg-border" />}
      {finalVideoActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            type="button"
            className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => { action.onClick(); closeMenu(); }}
          >
            <Icon className="h-4 w-4" />
            {action.label}
          </button>
        );
      })}
      {imageActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            type="button"
            className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => { action.onClick(); closeMenu(); }}
          >
            <Icon className="h-4 w-4" />
            {action.label}
          </button>
        );
      })}
      {(finalVideoActions.length > 0 || imageActions.length > 0) && defaultActions.length > 0 && <div className="my-1 h-px bg-border" />}
      {defaultActions.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.key}
            type="button"
            className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground"
            onClick={() => { action.onClick(); closeMenu(); }}
          >
            <Icon className="h-4 w-4" />
            {action.label}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}
