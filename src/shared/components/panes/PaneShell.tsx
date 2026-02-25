import React, { useEffect, useState } from 'react';

import { cn } from '@/shared/components/ui/contracts/cn';

interface PaneShellProps {
  isOpen: boolean;
  showBackdrop: boolean;
  onBackdropClose: () => void;
  backdropZIndexClassName: string;
  pointerDelayMs?: number;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  containerProps?: Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'style'>;
  contentClassName?: string;
  children: React.ReactNode;
}

/**
 * Shared pane shell that standardizes:
 * 1) backdrop close behavior
 * 2) delayed pointer-event activation after open animation
 */
export function PaneShell({
  isOpen,
  showBackdrop,
  onBackdropClose,
  backdropZIndexClassName,
  pointerDelayMs = 300,
  containerClassName,
  containerStyle,
  containerProps,
  contentClassName,
  children,
}: PaneShellProps) {
  const [isPointerEventsEnabled, setIsPointerEventsEnabled] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsPointerEventsEnabled(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      setIsPointerEventsEnabled(true);
    }, pointerDelayMs);

    return () => clearTimeout(timeoutId);
  }, [isOpen, pointerDelayMs]);

  return (
    <>
      {showBackdrop && (
        <div
          className={cn('fixed inset-0 touch-none', backdropZIndexClassName)}
          onTouchStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onBackdropClose();
          }}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onBackdropClose();
          }}
          aria-hidden="true"
        />
      )}

      <div
        {...containerProps}
        className={containerClassName}
        style={containerStyle}
      >
        <div
          className={cn(
            contentClassName,
            isPointerEventsEnabled ? 'pointer-events-auto' : 'pointer-events-none',
          )}
        >
          {children}
        </div>
      </div>
    </>
  );
}

