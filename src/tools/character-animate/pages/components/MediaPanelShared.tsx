import type { DragEventHandler, ReactNode } from 'react';
import { X } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';

interface MediaDropZoneProps {
  isDraggingOver: boolean;
  canOpenPicker: boolean;
  onOpenPicker: () => void;
  onDragOver: DragEventHandler<HTMLDivElement>;
  onDragEnter: DragEventHandler<HTMLDivElement>;
  onDragLeave: DragEventHandler<HTMLDivElement>;
  onDrop: DragEventHandler<HTMLDivElement>;
  children: ReactNode;
}

export function MediaDropZone(props: MediaDropZoneProps) {
  const {
    isDraggingOver,
    canOpenPicker,
    onOpenPicker,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    children,
  } = props;

  return (
    <div
      className={`aspect-video bg-muted rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden transition-colors relative ${
        isDraggingOver ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
      } ${canOpenPicker ? 'cursor-pointer' : ''}`}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => canOpenPicker && onOpenPicker()}
    >
      {children}
    </div>
  );
}

interface DeleteMediaButtonProps {
  onDelete: () => void;
  disabled: boolean;
}

export function DeleteMediaButton({ onDelete, disabled }: DeleteMediaButtonProps) {
  return (
    <Button
      variant="destructive"
      size="icon"
      className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-lg z-10"
      onClick={(event) => {
        event.stopPropagation();
        onDelete();
      }}
      disabled={disabled}
    >
      <X className="h-4 w-4" />
    </Button>
  );
}

export function ReplaceDropOverlay({ show }: { show: boolean }) {
  if (!show) {
    return null;
  }

  return (
    <div className="absolute inset-0 bg-primary/20 backdrop-blur-sm flex items-center justify-center pointer-events-none z-20">
      <p className="text-lg font-medium text-foreground">Drop to replace</p>
    </div>
  );
}
