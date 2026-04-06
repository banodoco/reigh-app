import type { ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Clapperboard, FolderPlus } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { Shot } from '@/domains/generation/types';
import { usePortalMousedownGuard } from '@/shared/hooks/usePortalMousedownGuard';

interface SelectionContextMenuProps {
  position: { x: number; y: number } | null;
  onClose: () => void;
  onCreateShot: () => Promise<Shot | null>;
  onGenerateVideo: () => void | Promise<void>;
  onNavigateToShot?: (shot: Shot) => void;
  onOpenGenerateVideo?: (shot: Shot) => void;
  existingShots?: Shot[];
  isCreating?: boolean;
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        'relative flex w-full select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
        disabled
          ? 'cursor-wait opacity-60'
          : 'hover:bg-accent hover:text-accent-foreground',
      )}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  );
}

export function SelectionContextMenu({
  position,
  onClose,
  onCreateShot,
  onGenerateVideo,
  onNavigateToShot,
  onOpenGenerateVideo,
  existingShots,
  isCreating = false,
}: SelectionContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null);
  const [createdShot, setCreatedShot] = useState<Shot | null>(null);
  const [isCreatingLocal, setIsCreatingLocal] = useState(false);

  // Reset created shot when menu closes/reopens
  useEffect(() => {
    if (position) {
      setCreatedShot(null);
      setIsCreatingLocal(false);
    }
  }, [position]);

  // Clamp menu position to viewport after it renders and we know its size
  useLayoutEffect(() => {
    if (!position || !menuRef.current) {
      setAdjustedPos(position);
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    const pad = 8;
    const x = Math.min(position.x, window.innerWidth - rect.width - pad);
    const y = Math.min(position.y, window.innerHeight - rect.height - pad);
    setAdjustedPos({ x: Math.max(pad, x), y: Math.max(pad, y) });
  }, [position]);

  usePortalMousedownGuard(menuRef, Boolean(position));

  useEffect(() => {
    if (!position) {
      return undefined;
    }

    const handleClickAway = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [position, onClose]);

  const handleCreateShot = useCallback(async () => {
    setIsCreatingLocal(true);
    const shot = await onCreateShot();
    setIsCreatingLocal(false);
    if (shot) {
      setCreatedShot(shot);
    }
  }, [onCreateShot]);

  if (!position) {
    return null;
  }

  const displayPos = adjustedPos ?? position;
  const visibleExistingShots = (existingShots ?? []).filter((shot) => shot.id !== createdShot?.id);
  const hasLowerShotActions = Boolean(
    !createdShot || (createdShot && (onNavigateToShot || onOpenGenerateVideo)),
  );

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
      style={{ left: displayPos.x, top: displayPos.y }}
    >
      {visibleExistingShots.map((shot) => (
        <div key={shot.id} className="flex w-full items-center gap-1 rounded-sm px-2 py-1.5 text-sm">
          <span className="min-w-0 flex-1 truncate">{shot.name}</span>
          {onOpenGenerateVideo && (
            <button type="button" className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent hover:text-accent-foreground" onClick={() => { onOpenGenerateVideo(shot); onClose(); }} title="Generate Video">
              <Clapperboard className="h-3.5 w-3.5" />
            </button>
          )}
          {onNavigateToShot && (
            <button type="button" className="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-accent hover:text-accent-foreground" onClick={() => { onNavigateToShot(shot); onClose(); }} title="Jump to shot">
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
      {visibleExistingShots.length > 0 && hasLowerShotActions && (
        <div className="my-1 h-px bg-border" />
      )}
      {!createdShot && (
        <MenuItem
          icon={<FolderPlus className="h-4 w-4" />}
          label={isCreatingLocal ? 'Creating…' : 'Create Shot'}
          onClick={() => void handleCreateShot()}
          disabled={isCreatingLocal || isCreating}
        />
      )}
      {createdShot && onNavigateToShot && (
        <MenuItem
          icon={<ArrowRight className="h-4 w-4" />}
          label={`Jump to ${createdShot.name}`}
          onClick={() => { onNavigateToShot(createdShot); onClose(); }}
        />
      )}
      {createdShot && onOpenGenerateVideo && (
        <MenuItem
          icon={<Clapperboard className="h-4 w-4" />}
          label="Generate Video"
          onClick={() => { onOpenGenerateVideo(createdShot); onClose(); }}
        />
      )}
      {!createdShot && (
        <MenuItem
          icon={<Clapperboard className="h-4 w-4" />}
          label="Generate Video"
          onClick={() => { onClose(); void onGenerateVideo(); }}
          disabled={isCreating}
        />
      )}
    </div>,
    document.body,
  );
}
