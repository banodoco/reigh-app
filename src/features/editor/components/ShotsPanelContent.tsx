import React, { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { useShots } from '@/shared/contexts/ShotsContext';
import { useShotFinalVideos, type ShotFinalVideo } from '@/tools/travel-between-images/hooks/video/useShotFinalVideos';
import { setShotDragData, createDragPreview } from '@/shared/lib/dnd/dragDrop';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { isVideoGeneration } from '@/shared/lib/typeGuards';
import { getDisplayUrl } from '@/shared/lib/media/mediaUrl';
import type { Shot } from '@/domains/generation/types';

interface ShotsPanelContentProps {
  projectId: string;
}

function ShotCard({ shot, finalVideo }: { shot: Shot; finalVideo?: ShotFinalVideo }) {
  const thumbnailUrl = finalVideo?.thumbnailUrl
    ?? getDisplayUrl(shot.images?.[0]?.thumbUrl ?? shot.images?.[0]?.imageUrl ?? shot.images?.[0]?.location);
  const imageCount = shot.images?.filter((img) => !isVideoGeneration(img)).length ?? 0;

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    const imageGenerationIds = (shot.images ?? [])
      .filter((image) => !isVideoGeneration(image))
      .map((image) => getGenerationId(image))
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    setShotDragData(event, {
      shotId: shot.id,
      shotName: shot.name,
      imageGenerationIds,
    });

    const cleanup = createDragPreview(
      event,
      imageGenerationIds.length > 1 ? { badgeText: String(imageGenerationIds.length) } : undefined,
    );
    if (cleanup) setTimeout(cleanup, 0);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group flex cursor-grab flex-col overflow-hidden rounded-md border border-border bg-card/80 transition-colors hover:border-accent active:cursor-grabbing"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={shot.name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">
            No images
          </div>
        )}
        {finalVideo && (
          <div className="absolute bottom-0.5 right-0.5 rounded bg-background/70 px-1 py-0.5 text-[8px] font-medium text-foreground backdrop-blur-sm">
            Video
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 px-1.5 py-1">
        <span className="min-w-0 flex-1 truncate text-[10px] text-foreground">{shot.name}</span>
        <span className="shrink-0 text-[9px] text-muted-foreground">{imageCount}</span>
      </div>
    </div>
  );
}

export function ShotsPanelContent({ projectId }: ShotsPanelContentProps) {
  const { shots, isLoading } = useShots();
  const { finalVideoMap } = useShotFinalVideos(projectId);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredShots = useMemo(() => {
    if (!shots) return [];
    if (!searchQuery.trim()) return shots;
    const query = searchQuery.toLowerCase();
    return shots.filter((shot) => shot.name.toLowerCase().includes(query));
  }, [shots, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading shots…
      </div>
    );
  }

  if (!shots || shots.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        No shots yet
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search bar */}
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Search className="h-3 w-3 shrink-0 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          placeholder="Search shots…"
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
        {searchQuery && (
          <button type="button" onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Shot grid — horizontal scroll, 2 rows packed tight */}
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden px-2 py-2">
        <div
          className="grid h-full auto-cols-[100px] grid-flow-col gap-1.5"
          style={{ gridTemplateRows: 'repeat(auto-fill, minmax(0, 1fr))' }}
        >
          {filteredShots.map((shot) => (
            <ShotCard key={shot.id} shot={shot} finalVideo={finalVideoMap.get(shot.id)} />
          ))}
        </div>
      </div>

      {filteredShots.length === 0 && searchQuery && (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          No shots match "{searchQuery}"
        </div>
      )}
    </div>
  );
}
