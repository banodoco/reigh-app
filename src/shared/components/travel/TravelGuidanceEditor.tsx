import React from 'react';
import { Label } from '@/shared/components/ui/primitives/label';
import { Slider } from '@/shared/components/ui/slider';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import {
  type TravelGuidanceMode,
} from '@/shared/lib/tasks/travelGuidance';
import {
  getModelSpec,
  type SelectedModel,
} from '@/tools/travel-between-images/settings';

export type TravelGuidanceEditorField =
  | 'selectedModel'
  | 'guidanceScale'
  | 'guidanceMode'
  | 'guidanceTreatment'
  | 'guidanceStrength'
  | 'guidanceUni3cEndPercent'
  | 'guidanceCannyIntensity'
  | 'guidanceDepthContrast';

interface TravelGuidanceEditorProps {
  selectedModel: SelectedModel;
  onSelectedModelChange?: (model: SelectedModel) => void;
  hasStructureVideo: boolean;
  showGuidanceControls?: boolean;
  guidanceMode?: TravelGuidanceMode | null;
  onGuidanceModeChange?: (mode: TravelGuidanceMode) => void;
  guidanceScale?: number;
  onGuidanceScaleChange?: (value: number) => void;
  guidanceStrength?: number;
  onGuidanceStrengthChange?: (value: number) => void;
  guidanceTreatment?: 'adjust' | 'clip';
  onGuidanceTreatmentChange?: (value: 'adjust' | 'clip') => void;
  guidanceUni3cEndPercent?: number;
  onGuidanceUni3cEndPercentChange?: (value: number) => void;
  guidanceCannyIntensity?: number;
  onGuidanceCannyIntensityChange?: (value: number) => void;
  guidanceDepthContrast?: number;
  onGuidanceDepthContrastChange?: (value: number) => void;
  fieldControls?: Partial<Record<TravelGuidanceEditorField, React.ReactNode>>;
  className?: string;
}

const MODE_LABELS: Record<TravelGuidanceMode, string> = {
  flow: 'Flow',
  raw: 'Raw',
  depth: 'Depth',
  canny: 'Canny',
  uni3c: 'Uni3C',
  pose: 'Pose',
  video: 'Video',
};

function renderFieldHeader(
  label: string,
  controls?: React.ReactNode,
  valueLabel?: string,
): React.ReactNode {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Label className="text-sm">{label}</Label>
        {controls}
      </div>
      {valueLabel ? <span className="text-sm font-medium">{valueLabel}</span> : null}
    </div>
  );
}

function clampSliderValue(
  value: number[] | number,
  fallback: number,
): number {
  return Array.isArray(value) ? (value[0] ?? fallback) : value;
}

export const TravelGuidanceEditor: React.FC<TravelGuidanceEditorProps> = ({
  selectedModel,
  onSelectedModelChange,
  hasStructureVideo,
  showGuidanceControls = true,
  guidanceMode,
  onGuidanceModeChange,
  guidanceScale,
  onGuidanceScaleChange,
  guidanceStrength = 1,
  onGuidanceStrengthChange,
  guidanceTreatment,
  onGuidanceTreatmentChange,
  guidanceUni3cEndPercent = 0.1,
  onGuidanceUni3cEndPercentChange,
  guidanceCannyIntensity = 1,
  onGuidanceCannyIntensityChange,
  guidanceDepthContrast = 1,
  onGuidanceDepthContrastChange,
  fieldControls,
  className,
}) => {
  const spec = getModelSpec(selectedModel);
  const ltxSelected = spec.modelFamily === 'ltx';
  const fullLtxSelected = spec.id === 'ltx-2.3';
  const supportedModes = spec.supportedGuidanceModes;
  const guidanceScaleEnabled = spec.ui.guidanceScale;
  const effectiveGuidanceMode = guidanceMode && supportedModes.includes(guidanceMode)
    ? guidanceMode
    : supportedModes[0];

  return (
    <div className={className ?? 'space-y-4'}>
      {onSelectedModelChange ? (
        <div className="space-y-2">
          {renderFieldHeader('Model', fieldControls?.selectedModel)}
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['wan-2.2', 'WAN 2.2'],
              ['ltx-2.3-fast', 'LTX 2.3'],
            ] as const).map(([value, label]) => {
              const isSelected = value === 'ltx-2.3-fast' ? ltxSelected : !ltxSelected;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelectedModelChange(value)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:border-primary/40 hover:bg-muted'
                  }`}
                >
                  {label}
                </button>
              );
            })}
            {ltxSelected ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Variant</span>
                {([
                  ['ltx-2.3-fast', 'Distilled'],
                  ['ltx-2.3', 'Full'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={spec.id === value}
                    onClick={() => onSelectedModelChange(value)}
                    className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                      spec.id === value
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:border-primary/40 hover:bg-muted'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {guidanceScaleEnabled && guidanceScale !== undefined && onGuidanceScaleChange ? (
        <div className="space-y-2">
          {renderFieldHeader(
            'Guidance Scale',
            fieldControls?.guidanceScale,
            guidanceScale.toFixed(1),
          )}
          <Slider
            value={guidanceScale}
            onValueChange={(value) => onGuidanceScaleChange(clampSliderValue(value, guidanceScale))}
            min={1}
            max={10}
            step={0.1}
            className="w-full"
          />
        </div>
      ) : null}

      {!showGuidanceControls || !hasStructureVideo ? null : fullLtxSelected ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200">
          Full LTX currently supports unguided travel only. Use WAN 2.2 for flow, depth, canny, or raw guidance, or use LTX 2.3 Distilled for pose, depth, canny, or video guidance.
        </div>
      ) : (
        <div className="space-y-4">
          {effectiveGuidanceMode && onGuidanceModeChange ? (
            <div className="space-y-2">
              {renderFieldHeader('Guidance Mode', fieldControls?.guidanceMode)}
              <div className="flex flex-wrap items-center gap-2">
                {supportedModes.map((mode) => {
                  const isSelected = effectiveGuidanceMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => onGuidanceModeChange(mode)}
                      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background hover:border-primary/40 hover:bg-muted'
                      }`}
                    >
                      {MODE_LABELS[mode]}
                    </button>
                  );
                })}
                {effectiveGuidanceMode && (
                  <span className="text-xs text-muted-foreground ml-1">
                    {effectiveGuidanceMode === 'uni3c'
                      ? `using Uni3C for ${ltxSelected ? 'LTX 2.3' : 'WAN 2.2'}`
                      : ltxSelected
                        ? 'using IC-LoRA control'
                        : 'using VACE'}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {guidanceTreatment && onGuidanceTreatmentChange ? (
            <div className="space-y-2">
              {renderFieldHeader('Treatment', fieldControls?.guidanceTreatment)}
              <SegmentedControl
                value={guidanceTreatment}
                onValueChange={(value) => onGuidanceTreatmentChange(value as 'adjust' | 'clip')}
                className="w-full"
                size="sm"
              >
                <SegmentedControlItem value="adjust" className="flex-1">
                  Fit to range
                </SegmentedControlItem>
                <SegmentedControlItem value="clip" className="flex-1">
                  1:1 mapping
                </SegmentedControlItem>
              </SegmentedControl>
            </div>
          ) : null}

          {onGuidanceStrengthChange ? (
            <div className="space-y-2">
              {renderFieldHeader(
                'Strength',
                fieldControls?.guidanceStrength,
                `${guidanceStrength.toFixed(1)}x`,
              )}
              <Slider
                value={guidanceStrength}
                onValueChange={(value) => onGuidanceStrengthChange(clampSliderValue(value, guidanceStrength))}
                min={0}
                max={2}
                step={0.1}
                className="w-full"
              />
            </div>
          ) : null}

          {effectiveGuidanceMode === 'uni3c' && onGuidanceUni3cEndPercentChange ? (
            <div className="space-y-2">
              {renderFieldHeader(
                'End',
                fieldControls?.guidanceUni3cEndPercent,
                `${(guidanceUni3cEndPercent * 100).toFixed(0)}%`,
              )}
              <Slider
                value={guidanceUni3cEndPercent}
                onValueChange={(value) => onGuidanceUni3cEndPercentChange(clampSliderValue(value, guidanceUni3cEndPercent))}
                min={0}
                max={1}
                step={0.05}
                className="w-full"
              />
            </div>
          ) : null}

          {effectiveGuidanceMode === 'canny' && onGuidanceCannyIntensityChange ? (
            <div className="space-y-2">
              {renderFieldHeader(
                'Canny Intensity',
                fieldControls?.guidanceCannyIntensity,
                `${guidanceCannyIntensity.toFixed(2)}x`,
              )}
              <Slider
                value={guidanceCannyIntensity}
                onValueChange={(value) => onGuidanceCannyIntensityChange(clampSliderValue(value, guidanceCannyIntensity))}
                min={0.25}
                max={2}
                step={0.05}
                className="w-full"
              />
            </div>
          ) : null}

          {effectiveGuidanceMode === 'depth' && onGuidanceDepthContrastChange ? (
            <div className="space-y-2">
              {renderFieldHeader(
                'Depth Contrast',
                fieldControls?.guidanceDepthContrast,
                `${guidanceDepthContrast.toFixed(2)}x`,
              )}
              <Slider
                value={guidanceDepthContrast}
                onValueChange={(value) => onGuidanceDepthContrastChange(clampSliderValue(value, guidanceDepthContrast))}
                min={0.25}
                max={2}
                step={0.05}
                className="w-full"
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
