import { useMemo } from 'react';
import { Check, Copy } from 'lucide-react';
import { getDisplayNameFromUrl } from '../../../../domains/lora/lib/loraUtils';
import { asNumber, asRecord, asString } from '../../../lib/tasks/taskParamParsers';
import { getVariantConfig, type TaskDetailsProps } from '../../../types/taskDetailsTypes';
import type { PhaseLoraConfig, PhaseSettings } from '../../../types/phaseConfig';

interface TaskPhaseDetailsProps {
  config: ReturnType<typeof getVariantConfig>;
  phaseConfig: Record<string, unknown> | undefined;
  phaseStepsDisplay: string | null;
  showSummary: boolean;
  borderTopClassName?: string;
  availableLoras: TaskDetailsProps['availableLoras'];
  copiedLoraUrl: string | null;
  onCopyLoraUrl: (url: string) => void;
}

export function TaskPhaseDetails({
  config,
  phaseConfig,
  phaseStepsDisplay,
  showSummary,
  borderTopClassName,
  availableLoras,
  copiedLoraUrl,
  onCopyLoraUrl,
}: TaskPhaseDetailsProps) {
  const phaseSettings = useMemo(() => {
    if (!Array.isArray(phaseConfig?.phases)) {
      return [];
    }
    return phaseConfig.phases as PhaseSettings[];
  }, [phaseConfig]);

  const phaseStepsPerPhase = useMemo(() => {
    if (!Array.isArray(phaseConfig?.steps_per_phase)) {
      return undefined;
    }
    const parsed = phaseConfig.steps_per_phase
      .map((value) => asNumber(value))
      .filter((value): value is number => value !== undefined);
    return parsed.length > 0 ? parsed : undefined;
  }, [phaseConfig]);

  if (phaseSettings.length === 0) {
    return null;
  }

  const phaseCount = asNumber(phaseConfig?.num_phases) || phaseSettings.length;
  const phaseFlowShift = asNumber(phaseConfig?.flow_shift);
  const phaseSolver = asString(phaseConfig?.sample_solver);

  return (
    <>
      {showSummary && (
        <div className="space-y-2">
          <p className={`${config.textSize} font-medium text-muted-foreground`}>
            Phase Settings
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className={`${config.textSize} text-muted-foreground`}>Phases:</span>{' '}
              <span className={`${config.textSize} ${config.fontWeight}`}>{phaseCount}</span>
            </div>
            {phaseFlowShift !== undefined && (
              <div>
                <span className={`${config.textSize} text-muted-foreground`}>Flow Shift:</span>{' '}
                <span className={`${config.textSize} ${config.fontWeight}`}>
                  {phaseFlowShift}
                </span>
              </div>
            )}
            {phaseSolver && (
              <div>
                <span className={`${config.textSize} text-muted-foreground`}>Solver:</span>{' '}
                <span className={`${config.textSize} ${config.fontWeight} capitalize`}>
                  {phaseSolver}
                </span>
              </div>
            )}
          </div>
          {phaseStepsDisplay && (
            <div>
              <span className={`${config.textSize} text-muted-foreground`}>
                Steps per Phase:
              </span>{' '}
              <span className={`${config.textSize} ${config.fontWeight}`}>
                {phaseStepsDisplay}
              </span>
            </div>
          )}
        </div>
      )}
      <div
        className={`${
          borderTopClassName ?? 'pt-2'
        } border-t border-muted-foreground/20 space-y-2`}
      >
        <p className={`${config.textSize} font-medium text-muted-foreground`}>Phases</p>
        {phaseSettings.map((phase, phaseIndex) => (
          <div key={phase.phase} className="space-y-1">
            <p className={`${config.textSize} font-medium`}>Phase {phase.phase}</p>
            <div className="ml-2 space-y-1">
              <div className="flex gap-3">
                <span className={`${config.textSize} text-muted-foreground`}>
                  Guidance:{' '}
                  <span className={`${config.fontWeight} text-foreground`}>
                    {Number(phase.guidance_scale).toFixed(1)}
                  </span>
                </span>
                {phaseStepsPerPhase?.[phaseIndex] !== undefined && (
                  <span className={`${config.textSize} text-muted-foreground`}>
                    Steps:{' '}
                    <span className={`${config.fontWeight} text-foreground`}>
                      {phaseStepsPerPhase[phaseIndex]}
                    </span>
                  </span>
                )}
              </div>
              {phase.loras?.length > 0 &&
                phase.loras.map((lora: PhaseLoraConfig & { name?: string }, idx) => (
                  <div
                    key={idx}
                    className={`group/lora flex items-center gap-2 p-1.5 bg-background/50 rounded border ${config.textSize} min-w-0`}
                  >
                    <span className={`${config.fontWeight} truncate min-w-0 flex-1`}>
                      {getDisplayNameFromUrl(
                        asString(asRecord(lora)?.url) ?? '',
                        availableLoras,
                        asString(asRecord(lora)?.name)
                      )}
                    </span>
                    <button
                      onClick={() =>
                        onCopyLoraUrl(asString(asRecord(lora)?.url) ?? '')
                      }
                      className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/lora:opacity-100 shrink-0"
                      title="Copy LoRA URL"
                    >
                      {copiedLoraUrl === asString(asRecord(lora)?.url) ? (
                        <Check className="w-3 h-3 text-green-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                    <span className="text-muted-foreground shrink-0">
                      {Number(asNumber(asRecord(lora)?.multiplier) ?? 0).toFixed(1)}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
