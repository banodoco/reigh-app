import type { PointerEvent, TouchEvent } from 'react';

interface PaneBackdropProps {
  show: boolean;
  zIndex: number;
  onClose: () => void;
}

export function PaneBackdrop({ show, zIndex, onClose }: PaneBackdropProps) {
  if (!show) {
    return null;
  }

  const handleDismiss = (
    event: TouchEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 touch-none"
      style={{ zIndex }}
      onTouchStart={handleDismiss}
      onPointerDown={handleDismiss}
      aria-hidden="true"
    />
  );
}
