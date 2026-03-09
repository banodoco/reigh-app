import React from 'react';
import { Check, Copy } from 'lucide-react';
import { getDisplayNameFromUrl } from '../../../../domains/lora/lib/loraUtils';
import type { getVariantConfig } from '../../../types/taskDetailsTypes';
import type { LoraModel } from '../../../../domains/lora/types/lora';

interface TaskLoraDetailsProps {
  config: ReturnType<typeof getVariantConfig>;
  additionalLoras: Record<string, unknown> | undefined;
  availableLoras: LoraModel[] | undefined;
  copiedLoraUrl: string | null;
  onCopyLoraUrl: (url: string) => void;
}

function formatStrength(strength: unknown): string {
  const numeric = typeof strength === 'number' ? strength : Number(strength);
  if (Number.isFinite(numeric)) {
    return numeric.toFixed(1);
  }
  return String(strength ?? 'N/A');
}

export const TaskLoraDetails: React.FC<TaskLoraDetailsProps> = ({
  config,
  additionalLoras,
  availableLoras,
  copiedLoraUrl,
  onCopyLoraUrl,
}) => {
  if (!additionalLoras) {
    return null;
  }

  const entries = Object.entries(additionalLoras);
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="pt-2 border-t border-muted-foreground/20 space-y-2">
      <p className={`${config.textSize} font-medium text-muted-foreground`}>LoRAs</p>
      {entries.slice(0, config.maxLoras).map(([url, strength]) => (
        <div
          key={url}
          className={`group/lora flex items-center gap-2 p-1.5 bg-background/50 rounded border ${config.textSize} min-w-0`}
        >
          <span className={`${config.fontWeight} truncate min-w-0 flex-1`}>
            {getDisplayNameFromUrl(url, availableLoras)}
          </span>
          <button
            onClick={() => onCopyLoraUrl(url)}
            className="p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/lora:opacity-100 shrink-0"
            title="Copy LoRA URL"
          >
            {copiedLoraUrl === url
              ? <Check className="w-3 h-3 text-green-500" />
              : <Copy className="w-3 h-3" />}
          </button>
          <span className="text-muted-foreground shrink-0">{formatStrength(strength)}</span>
        </div>
      ))}
    </div>
  );
};
