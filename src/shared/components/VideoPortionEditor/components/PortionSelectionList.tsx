import { Plus } from 'lucide-react';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { PortionSelectionCard } from '@/shared/components/VideoPortionEditor/components/PortionSelectionCard';
import type { UpdatePortionSelectionSettings } from '@/shared/components/VideoPortionEditor/types';

interface PortionSelectionListProps {
  selections: PortionSelection[];
  gapFrames: number;
  contextFrames: number;
  videoUrl?: string;
  fps?: number | null;
  onUpdateSelectionSettings: UpdatePortionSelectionSettings;
  onRemoveSelection?: (id: string) => void;
  onAddSelection?: () => void;
}

export function PortionSelectionList({
  selections,
  gapFrames,
  contextFrames,
  videoUrl,
  fps,
  onUpdateSelectionSettings,
  onRemoveSelection,
  onAddSelection,
}: PortionSelectionListProps) {
  const orderedSelections = [...selections].sort((a, b) => a.start - b.start);

  return (
    <div className="space-y-2">
      <div className="space-y-3">
        {orderedSelections.map((selection, index) => (
          <PortionSelectionCard
            key={selection.id}
            selection={selection}
            index={index}
            totalSelections={selections.length}
            gapFrames={gapFrames}
            contextFrames={contextFrames}
            videoUrl={videoUrl}
            fps={fps}
            onUpdateSelectionSettings={onUpdateSelectionSettings}
            onRemoveSelection={onRemoveSelection}
          />
        ))}
      </div>

      {onAddSelection && (
        <button
          onClick={onAddSelection}
          className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 hover:border-muted-foreground/50 rounded-lg transition-colors -mt-1"
        >
          <Plus className="w-3 h-3" />
          Add selection
        </button>
      )}
    </div>
  );
}
