import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import { Copy, Check } from 'lucide-react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface CopyIdButtonProps {
  id: string;
}

export const CopyIdButton: React.FC<CopyIdButtonProps> = ({ id }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      normalizeAndPresentError(err, { context: 'CopyIdButton', showToast: false });
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleCopy}
          className="p-1 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50 transition-colors"
          title="Copy preset ID"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{copied ? 'Copied!' : 'Copy preset ID'}</p>
        {!copied && <p className="text-xs text-muted-foreground font-mono">{id.substring(0, 8)}...</p>}
      </TooltipContent>
    </Tooltip>
  );
};
