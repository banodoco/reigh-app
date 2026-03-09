import * as React from 'react';
import { Check, Loader2, Mic, Square, Wand2 } from 'lucide-react';
import type { TextProcessingState } from './useAIInputTextPopover';

type AIInputMode = 'voice' | 'text';

interface VisualStateInput {
  mode: AIInputMode;
  voiceState: string;
  textState: TextProcessingState;
  hasExistingContent: boolean;
}

export function getMainIcon({
  mode,
  voiceState,
  textState,
}: VisualStateInput): React.ReactNode {
  if (mode === 'voice') {
    switch (voiceState) {
      case 'recording':
        return <Square className="h-3 w-3 fill-current" />;
      case 'processing':
        return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
      default:
        return <Mic className="h-3.5 w-3.5" />;
    }
  }

  switch (textState) {
    case 'processing':
      return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
    case 'success':
      return <Check className="h-3.5 w-3.5" />;
    default:
      return <Wand2 className="h-3.5 w-3.5" />;
  }
}

export function getTooltipText({
  mode,
  voiceState,
  hasExistingContent,
}: VisualStateInput): string {
  if (mode === 'voice') {
    switch (voiceState) {
      case 'recording':
        return 'Stop recording';
      case 'processing':
        return 'Processing...';
      default:
        return hasExistingContent
          ? 'Voice input to create/edit prompt'
          : 'Voice input to create prompt';
    }
  }

  return hasExistingContent
    ? 'Type instructions to create/edit prompt'
    : 'Type instructions to create prompt';
}

export function getButtonStyles({
  mode,
  voiceState,
  textState,
}: VisualStateInput): string {
  if (mode === 'voice') {
    if (voiceState === 'recording') {
      return 'bg-red-500 text-white hover:bg-red-600';
    }
  } else {
    if (textState === 'open' || textState === 'processing') {
      return 'bg-purple-500 text-white hover:bg-purple-600';
    }
    if (textState === 'success') {
      return 'bg-green-500 text-white hover:bg-green-600';
    }
  }
  return 'bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground';
}
