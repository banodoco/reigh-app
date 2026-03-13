import React from 'react';
import { Card, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/primitives/label";
import { Slider } from "@/shared/components/ui/slider";
import { Pencil, Trash2 } from 'lucide-react';
import { HoverScrubVideo } from '@/shared/components/media/HoverScrubVideo';
import { useIsMobile } from '@/shared/hooks/mobile';
import type { Resource } from '@/features/resources/hooks/useResources';
import type { LoraModel } from '../types';
import { LoraCardProps } from '../types';

const LoraCardComponent: React.FC<LoraCardProps> = ({
  lora,
  isSelectedOnGenerator,
  strength,
  isMyLora,
  isInSavedLoras,
  isLocalLora,
  resourceId,
  onAddLora,
  onRemoveLora,
  onUpdateLoraStrength,
  onSave,
  onEdit,
  onDelete,
  onShowFullDescription,
  isSaving,
  isDeleting,
}) => {
  const isMobile = useIsMobile();

  return (
    <Card
      className={`w-full h-full transition-all duration-200 shadow-none ${
        isSelectedOnGenerator
          ? 'border-green-500'
          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
      }`}
    >
      <div className="flex flex-row p-2 gap-2 h-full">
        {/* Left side: Info and controls */}
        <div className="flex-1 min-w-0 flex flex-col min-h-20 h-full">
          {/* Top content */}
          <div>
            {/* Title row */}
            <div className="flex items-start gap-1.5 mb-0.5">
              <CardTitle className="text-base leading-tight truncate" title={lora.Name !== "N/A" ? lora.Name : lora["Model ID"]}>
                {lora.Name !== "N/A" ? lora.Name : lora["Model ID"]}
              </CardTitle>
              {isMyLora && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 flex-shrink-0">
                  {isLocalLora ? 'Local' : 'Mine'}
                </span>
              )}
            </div>

            {/* Author & stats */}
            <p className="text-xs text-muted-foreground truncate" title={lora.Author}>
              {lora.Author}
              {(lora.Downloads || lora.Likes) && ' · '}
              {lora.Downloads && <span>↓{lora.Downloads.toLocaleString()}</span>}
              {lora.Downloads && lora.Likes && ' '}
              {lora.Likes && <span>♥{lora.Likes.toLocaleString()}</span>}
            </p>

            {/* Description */}
            {lora.Description && (
              <p
                className="text-[11px] text-muted-foreground/80 truncate cursor-pointer hover:text-muted-foreground mt-0.5"
                title={lora.Description}
                onClick={() => onShowFullDescription(lora.Name, lora.Description!)}
              >
                {lora.Description}
              </p>
            )}
          </div>

          {/* Bottom section - pushed to bottom */}
          <div className="mt-auto pt-1.5">
            {/* Action buttons */}
            <div className="flex gap-1 flex-wrap">
              {isSelectedOnGenerator ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    onRemoveLora(lora["Model ID"]);
                  }}
                >
                  Remove
                </Button>
              ) : (
                <Button
                  variant="default"
                  size="sm"
                  className="h-6 px-2 text-xs bg-green-600 hover:bg-green-700"
                  onClick={() => {
                    if (lora["Model Files"] && lora["Model Files"].length > 0) {
                      onAddLora(lora);
                    }
                  }}
                  disabled={!lora["Model Files"] || lora["Model Files"].length === 0}
                >
                  Add
                </Button>
              )}
              {!isMyLora && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onSave(lora)}
                  disabled={isInSavedLoras || isSaving}
                >
                  {isInSavedLoras ? 'Saved' : 'Save'}
                </Button>
              )}
              {isMyLora && !isLocalLora && resourceId && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      onEdit({ id: resourceId, metadata: lora } as Resource & { metadata: LoraModel });
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      onDelete(resourceId, lora.Name, isSelectedOnGenerator);
                    }}
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>

            {/* Strength slider - below buttons when selected */}
            {isSelectedOnGenerator && (
              <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-green-200 dark:border-green-800">
                <Label htmlFor={`lora-strength-${lora['Model ID']}`} className="text-[11px] flex-shrink-0 text-green-700 dark:text-green-300">Strength:</Label>
                <Slider
                  id={`lora-strength-${lora['Model ID']}`}
                  value={strength ?? 1}
                  onValueChange={(value) =>
                    onUpdateLoraStrength(
                      lora['Model ID'],
                      Array.isArray(value) ? (value[0] ?? 1) : value
                    )
                  }
                  min={0} max={2} step={0.05}
                  className="flex-1"
                />
                <span className="text-[11px] font-light w-8 text-right text-green-700 dark:text-green-300">{strength?.toFixed(2)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Right side: Sample thumbnail */}
        <div className="flex-shrink-0 flex items-start relative">
          {/* Model type badge - bottom right of thumbnail */}
          {lora.lora_type && (
            <span className="absolute bottom-0 right-0 z-10 px-1 py-0.5 text-[8px] font-medium bg-black/70 text-white rounded-tl rounded-br whitespace-nowrap">
              {lora.lora_type}
            </span>
          )}
          <ThumbnailRenderer lora={lora} isMobile={isMobile} />
        </div>
      </div>
    </Card>
  );
};

// Extracted thumbnail rendering logic
interface ThumbnailRendererProps {
  lora: LoraCardProps['lora'];
  isMobile: boolean;
}

// Memoize to prevent re-renders when parent grid updates but this card hasn't changed
export const LoraCard = React.memo(LoraCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.lora['Model ID'] === nextProps.lora['Model ID'] &&
    prevProps.isSelectedOnGenerator === nextProps.isSelectedOnGenerator &&
    prevProps.strength === nextProps.strength &&
    prevProps.isMyLora === nextProps.isMyLora &&
    prevProps.isInSavedLoras === nextProps.isInSavedLoras &&
    prevProps.isSaving === nextProps.isSaving &&
    prevProps.isDeleting === nextProps.isDeleting
  );
});

const ThumbnailRenderer: React.FC<ThumbnailRendererProps> = ({ lora, isMobile }) => {
  if (lora.main_generation) {
    const mainSample = lora.sample_generations?.find(s => s.url === lora.main_generation);
    const isVideo = mainSample?.type === 'video';

    return isVideo ? (
      <div
        className="relative h-20 w-20 rounded border overflow-hidden hover:opacity-80 transition-opacity cursor-pointer"
        onClickCapture={(e) => {
          if (!isMobile) return;
          const container = e.currentTarget as HTMLElement;
          const video = container.querySelector('video') as HTMLVideoElement | null;
          if (!video) return;
          if (video.paused) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }}
      >
        <HoverScrubVideo
          src={lora.main_generation}
          className="h-full w-full"
          videoClassName="object-cover"
          autoplayOnHover={!isMobile}
          preload="metadata"
          loop
          muted
        />
      </div>
    ) : (
      <img
        src={lora.main_generation}
        alt={mainSample?.alt_text || `${lora.Name} main sample`}
        className="h-20 w-20 object-cover rounded border hover:opacity-80 transition-opacity cursor-pointer"
        title={mainSample?.alt_text || lora.main_generation}
        loading="lazy"
      />
    );
  }

  if (lora.Images && lora.Images.length > 0) {
    const image = lora.Images[0];
    const isVideo = image.type?.startsWith('video');

    return isVideo ? (
      <div
        className="relative h-20 w-20 rounded border overflow-hidden hover:opacity-80 transition-opacity cursor-pointer"
        onClickCapture={(e) => {
          if (!isMobile) return;
          const container = e.currentTarget as HTMLElement;
          const video = container.querySelector('video') as HTMLVideoElement | null;
          if (!video) return;
          if (video.paused) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }}
      >
        <HoverScrubVideo
          src={image.url}
          className="h-full w-full"
          videoClassName="object-cover"
          autoplayOnHover={!isMobile}
          preload="metadata"
          loop
          muted
        />
      </div>
    ) : (
      <img
        src={image.url}
        alt={image.alt_text || `${lora.Name} sample`}
        className="h-20 w-20 object-cover rounded border hover:opacity-80 transition-opacity cursor-pointer"
        title={image.alt_text || image.url}
        loading="lazy"
      />
    );
  }

  return (
    <div className="h-20 w-20 rounded border bg-muted flex items-center justify-center">
      <span className="text-[10px] text-muted-foreground">No image</span>
    </div>
  );
};
