import { useCallback, useEffect, useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Settings, Trash2, Video, Volume2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Slider } from '@/shared/components/ui/slider';
import { cn } from '@/shared/components/ui/contracts/cn';
import type { TrackBlendMode, TrackDefinition, TrackFit } from '@/tools/video-editor/types';

interface TrackLabelProps {
  id: string;
  track: TrackDefinition;
  isSelected: boolean;
  hasClips: boolean;
  onSelect: (trackId: string) => void;
  onChange: (trackId: string, patch: Partial<TrackDefinition>) => void;
  onRemove: (trackId: string) => void;
}

const FIT_OPTIONS: { value: TrackFit; label: string }[] = [
  { value: 'cover', label: 'Cover' },
  { value: 'contain', label: 'Contain' },
  { value: 'manual', label: 'Manual' },
];

const BLEND_OPTIONS: { value: TrackBlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'hard-light', label: 'Hard Light' },
];

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium text-muted-foreground">{children}</div>;
}

export function TrackLabel({
  id,
  track,
  isSelected,
  hasClips,
  onSelect,
  onChange,
  onRemove,
}: TrackLabelProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  useEffect(() => {
    if (!confirmingDelete) return;
    confirmTimerRef.current = setTimeout(() => setConfirmingDelete(false), 2000);
    return () => { if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current); };
  }, [confirmingDelete]);

  const handleRemoveClick = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    if (!hasClips) {
      onRemove(track.id);
      return;
    }
    if (confirmingDelete) {
      setConfirmingDelete(false);
      onRemove(track.id);
    } else {
      setConfirmingDelete(true);
    }
  }, [confirmingDelete, hasClips, onRemove, track.id]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative flex h-9 items-center gap-1 border-b border-border px-2 text-xs text-foreground',
        isSelected ? 'bg-accent/70' : 'bg-card/60 hover:bg-accent/50',
      )}
      onClick={() => onSelect(track.id)}
    >
      <span className="shrink-0 text-muted-foreground">
        {track.kind === 'visual' ? <Video className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
      </span>

      {/* Full label shown at rest, fades out on hover */}
      <span className="min-w-0 flex-1 truncate transition-opacity group-hover:opacity-0">
        {track.label}
      </span>

      {/* Editable input + action buttons on hover */}
      <div className="absolute inset-0 flex items-center gap-1 px-2 opacity-0 transition-opacity group-hover:opacity-100">
        <span className="w-[18px] shrink-0" />
        <input
          className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          value={track.label}
          onChange={(event) => onChange(track.id, { label: event.target.value })}
          onClick={(event) => event.stopPropagation()}
        />
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            title="Reorder track"
            aria-label="Reorder track"
            onClick={(event) => event.stopPropagation()}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                title="Track defaults"
                onClick={(event) => event.stopPropagation()}
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
              <DialogHeader>
                <DialogTitle>{track.label} — Track Defaults</DialogTitle>
                <DialogDescription>
                  New items dropped on this track will inherit these settings.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {track.kind === 'visual' && (
                  <>
                    <div className="space-y-1.5">
                      <FieldLabel>Fit</FieldLabel>
                      <Select
                        value={track.fit ?? 'contain'}
                        onValueChange={(value) => onChange(track.id, { fit: value as TrackFit })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Scale ({((track.scale ?? 1) * 100).toFixed(0)}%)</FieldLabel>
                      <Slider
                        value={[track.scale ?? 1]}
                        min={0.1}
                        max={2}
                        step={0.05}
                        onValueChange={(v) => onChange(track.id, { scale: v[0] })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Opacity ({((track.opacity ?? 1) * 100).toFixed(0)}%)</FieldLabel>
                      <Slider
                        value={[track.opacity ?? 1]}
                        min={0}
                        max={1}
                        step={0.05}
                        onValueChange={(v) => onChange(track.id, { opacity: v[0] })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Blend Mode</FieldLabel>
                      <Select
                        value={track.blendMode ?? 'normal'}
                        onValueChange={(value) => onChange(track.id, { blendMode: value as TrackBlendMode })}
                      >
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {BLEND_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}
                {track.kind === 'audio' && (
                  <div className="space-y-1.5">
                    <FieldLabel>Default Volume ({((track.opacity ?? 1) * 100).toFixed(0)}%)</FieldLabel>
                    <Slider
                      value={[track.opacity ?? 1]}
                      min={0}
                      max={1}
                      step={0.05}
                      onValueChange={(v) => onChange(track.id, { opacity: v[0] })}
                    />
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn('h-6 w-6', confirmingDelete ? 'text-destructive hover:text-destructive' : 'text-muted-foreground')}
            title={confirmingDelete ? 'Click again to confirm deletion' : 'Remove track'}
            onClick={handleRemoveClick}
          >
            {confirmingDelete ? <Check className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
