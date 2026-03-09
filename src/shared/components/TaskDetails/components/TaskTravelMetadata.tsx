import { asNumber, asString } from '../../../lib/tasks/taskParamParsers';
import { formatTravelModelName } from '../hooks/useVideoTravelTaskData';
import { getVariantConfig } from '../../../types/taskDetailsTypes';

interface TaskTravelMetadataProps {
  config: ReturnType<typeof getVariantConfig>;
  isSegmentTask: boolean;
  isAdvancedMode: boolean;
  modelName?: string;
  resolution?: string;
  frames?: number;
  phaseConfig: Record<string, unknown> | undefined;
  styleImage?: string;
  styleStrength?: number;
  presetName?: string | null;
}

export function TaskTravelMetadata({
  config,
  isSegmentTask,
  isAdvancedMode,
  modelName,
  resolution,
  frames,
  phaseConfig,
  styleImage,
  styleStrength,
  presetName,
}: TaskTravelMetadataProps) {
  const phaseFlowShift = asNumber(phaseConfig?.flow_shift);
  const phaseSolver = asString(phaseConfig?.sample_solver);

  return (
    <>
      {styleImage && (
        <div className="space-y-1.5">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Style Reference
          </p>
          <div className="flex items-center gap-3">
            <img src={styleImage} alt="Style" className="w-[80px] object-cover rounded border" />
            {styleStrength != null && (
              <span className={`${config.textSize} ${config.fontWeight}`}>
                Strength: {Math.round(styleStrength * 100)}%
              </span>
            )}
          </div>
        </div>
      )}

      {presetName && (
        <div className="space-y-1">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Motion Preset
          </p>
          <p className={`${config.textSize} ${config.fontWeight}`}>{presetName}</p>
        </div>
      )}

      {isAdvancedMode && (
        <div className="grid grid-cols-2 gap-3">
          {modelName && (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Model</p>
              <p className={`${config.textSize} ${config.fontWeight}`}>
                {formatTravelModelName(modelName)}
              </p>
            </div>
          )}
          <div className="space-y-1">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>
              Resolution
            </p>
            <p className={`${config.textSize} ${config.fontWeight}`}>{resolution || 'N/A'}</p>
          </div>
          <div className="space-y-1">
            <p className={`${config.textSize} font-medium text-muted-foreground`}>
              {isSegmentTask ? 'Frames' : 'Frames / Segment'}
            </p>
            <p className={`${config.textSize} ${config.fontWeight}`}>{frames || 'N/A'}</p>
          </div>
          {phaseFlowShift !== undefined && (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>
                Flow Shift
              </p>
              <p className={`${config.textSize} ${config.fontWeight}`}>{phaseFlowShift}</p>
            </div>
          )}
          {phaseSolver && (
            <div className="space-y-1">
              <p className={`${config.textSize} font-medium text-muted-foreground`}>Solver</p>
              <p className={`${config.textSize} ${config.fontWeight} capitalize`}>
                {phaseSolver}
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
