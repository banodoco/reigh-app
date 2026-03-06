import { Diamond, Square, Trash2 } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { BrushStroke } from '../hooks/inpainting/types';

interface AnnotationFloatingControlsProps {
  selectedShapeId: string | null;
  isAnnotateMode: boolean;
  brushStrokes: BrushStroke[];
  getDeleteButtonPosition: () => { x: number; y: number } | null;
  onToggleFreeForm: () => void;
  onDeleteSelected: () => void;
  positionStrategy?: 'absolute' | 'fixed';
  containerClassName?: string;
  freeFormActiveClassName?: string;
  freeFormInactiveClassName?: string;
  deleteButtonClassName?: string;
}

const DEFAULT_CONTAINER_CLASSNAME = 'z-[100] flex gap-2';
const DEFAULT_FREE_FORM_ACTIVE_CLASSNAME =
  'bg-primary hover:bg-primary/90 text-primary-foreground';
const DEFAULT_FREE_FORM_INACTIVE_CLASSNAME =
  'bg-muted-foreground hover:bg-muted-foreground/80 text-white';
const DEFAULT_DELETE_BUTTON_CLASSNAME =
  'bg-destructive hover:bg-destructive/90 text-destructive-foreground';

export function AnnotationFloatingControls(props: AnnotationFloatingControlsProps) {
  const {
    selectedShapeId,
    isAnnotateMode,
    brushStrokes,
    getDeleteButtonPosition,
    onToggleFreeForm,
    onDeleteSelected,
    positionStrategy = 'absolute',
    containerClassName,
    freeFormActiveClassName = DEFAULT_FREE_FORM_ACTIVE_CLASSNAME,
    freeFormInactiveClassName = DEFAULT_FREE_FORM_INACTIVE_CLASSNAME,
    deleteButtonClassName = DEFAULT_DELETE_BUTTON_CLASSNAME,
  } = props;

  if (!selectedShapeId || !isAnnotateMode) {
    return null;
  }

  const buttonPos = getDeleteButtonPosition();
  if (!buttonPos) {
    return null;
  }

  const selectedShape = brushStrokes.find((shape) => shape.id === selectedShapeId);
  const isFreeForm = selectedShape?.isFreeForm === true;

  return (
    <div
      className={cn(DEFAULT_CONTAINER_CLASSNAME, containerClassName)}
      style={{
        left: `${buttonPos.x}px`,
        top: `${buttonPos.y}px`,
        transform: 'translate(-50%, -50%)',
        position: positionStrategy,
      }}
    >
      <button
        onClick={onToggleFreeForm}
        className={cn(
          'rounded-full p-2 shadow-lg transition-colors',
          isFreeForm ? freeFormActiveClassName : freeFormInactiveClassName,
        )}
        title={
          isFreeForm
            ? 'Switch to rectangle mode (edges move linearly)'
            : 'Switch to free-form mode (rhombus/non-orthogonal angles)'
        }
      >
        {isFreeForm ? <Diamond className="h-4 w-4" /> : <Square className="h-4 w-4" />}
      </button>

      <button
        onClick={onDeleteSelected}
        className={cn(
          'rounded-full p-2 shadow-lg transition-colors',
          deleteButtonClassName,
        )}
        title="Delete annotation (or press DELETE key)"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
