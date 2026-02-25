import { Diamond, Square, Trash2 } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';

interface AnnotationActionOverlayProps {
  position: { x: number; y: number };
  isFreeForm: boolean;
  onToggleFreeForm: () => void;
  onDeleteSelected: () => void;
  positionMode?: 'absolute' | 'fixed';
  className?: string;
}

export function AnnotationActionOverlay({
  position,
  isFreeForm,
  onToggleFreeForm,
  onDeleteSelected,
  positionMode = 'fixed',
  className,
}: AnnotationActionOverlayProps) {
  return (
    <div
      className={cn(positionMode, 'z-[100] flex gap-2', className)}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <button
        onClick={onToggleFreeForm}
        className={cn(
          'rounded-full p-2 shadow-lg transition-colors',
          isFreeForm
            ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
            : 'bg-muted-foreground hover:bg-muted-foreground/80 text-white',
        )}
        title={isFreeForm
          ? 'Switch to rectangle mode (edges move linearly)'
          : 'Switch to free-form mode (rhombus/non-orthogonal angles)'}
      >
        {isFreeForm ? <Diamond className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </button>

      <button
        onClick={onDeleteSelected}
        className="rounded-full p-2 shadow-lg transition-colors bg-destructive hover:bg-destructive/90 text-destructive-foreground"
        title="Delete annotation (or press DELETE key)"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
