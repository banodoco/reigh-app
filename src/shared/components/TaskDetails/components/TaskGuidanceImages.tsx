import React from 'react';
import type { getVariantConfig } from '../../../types/taskDetailsTypes';
import { asNumber, asRecord, asString, type UnknownRecord } from '../../../lib/tasks/taskParamParsers';

interface TaskGuidanceImagesProps {
  config: ReturnType<typeof getVariantConfig>;
  effectiveInputImages: string[];
  showAllImages: boolean;
  onShowAllImagesChange?: (show: boolean) => void;
  videoPath: string | undefined;
  videoLoaded: boolean;
  onLoadVideo: () => void;
  structureGuidance: UnknownRecord | undefined;
  videoTreatment: string | undefined;
  motionStrength: number | undefined;
}

export const TaskGuidanceImages: React.FC<TaskGuidanceImagesProps> = ({
  config,
  effectiveInputImages,
  showAllImages,
  onShowAllImagesChange,
  videoPath,
  videoLoaded,
  onLoadVideo,
  structureGuidance,
  videoTreatment,
  motionStrength,
}) => {
  if (effectiveInputImages.length === 0 && !videoPath) {
    return null;
  }

  const structureData = asRecord(structureGuidance);
  const stepWindowValues = Array.isArray(structureData?.step_window)
    ? structureData.step_window
      .map((item) => asNumber(item))
      .filter((item): item is number => item !== undefined)
    : [];
  const structureTarget = asString(structureData?.target);
  const structureStrength = asNumber(structureData?.strength);

  return (
    <div className="flex gap-3 items-start">
      {effectiveInputImages.length > 0 && (
        <div className="gap-y-1.5 flex-1 min-w-0">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Image Guidance ({effectiveInputImages.length})
          </p>
          <div className={`grid gap-1 ${config.imageGridCols}`}>
            {(showAllImages ? effectiveInputImages : effectiveInputImages.slice(0, config.maxImages))
              .map((imageUrl, index) => (
                <img
                  key={index}
                  src={imageUrl}
                  alt={`Input ${index + 1}`}
                  className="w-full aspect-square object-cover rounded border shadow-sm"
                />
              ))}
            {effectiveInputImages.length > config.maxImages && !showAllImages && (
              <div
                onClick={() => onShowAllImagesChange?.(true)}
                className="w-full aspect-square bg-muted/50 hover:bg-muted/70 rounded border cursor-pointer flex items-center justify-center"
              >
                <span className={`${config.textSize} text-muted-foreground font-medium`}>
                  {effectiveInputImages.length - config.maxImages} more
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {videoPath && (
        <div className="space-y-1.5 shrink-0">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            {structureTarget ? 'Structure' : 'Video'}
          </p>
          <div className="flex items-start gap-2">
            <div
              className="relative group cursor-pointer shrink-0"
              style={{ width: '80px' }}
              onClick={onLoadVideo}
            >
              {!videoLoaded ? (
                <div className="w-full aspect-video bg-black rounded border flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              ) : (
                <video src={videoPath} className="w-full rounded border" loop muted playsInline autoPlay />
              )}
            </div>
            <div className={`${config.textSize} ${config.fontWeight} space-y-0.5`}>
              {structureStrength != null && (
                <div>
                  <span className="text-muted-foreground">Str: </span>
                  {structureStrength}
                </div>
              )}
              {stepWindowValues.length === 2 && (
                <div>
                  <span className="text-muted-foreground">Window: </span>
                  {stepWindowValues[0]}→{stepWindowValues[1]}
                </div>
              )}
              {videoTreatment && <div className="text-muted-foreground capitalize">{videoTreatment}</div>}
              {motionStrength != null && (
                <div>
                  <span className="text-muted-foreground">Motion: </span>
                  {Math.round(motionStrength * 100)}%
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
