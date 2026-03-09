import * as React from 'react';
import { getSupabaseClient as supabase } from '../../../integrations/supabase/client';
import { normalizeAndPresentError } from '../../lib/errorHandling/runtimeError';
import { getErrorMessage } from '../../lib/errorHandling/errorUtils';

export type TextProcessingState = 'idle' | 'open' | 'processing' | 'success';

interface UseAIInputTextPopoverParams {
  context?: string;
  example?: string;
  existingValue?: string;
  onResult: (result: { transcription: string; prompt?: string }) => void;
  onError?: (error: string) => void;
}

interface UseAIInputTextPopoverReturn {
  textState: TextProcessingState;
  inputValue: string;
  setInputValue: React.Dispatch<React.SetStateAction<string>>;
  isPopoverOpen: boolean;
  setIsPopoverOpen: React.Dispatch<React.SetStateAction<boolean>>;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  handlePopoverOpenChange: (open: boolean) => void;
  handleTextSubmit: () => Promise<void>;
  handleKeyDown: (e: React.KeyboardEvent) => void;
}

export function useAIInputTextPopover({
  context,
  example,
  existingValue = '',
  onResult,
  onError,
}: UseAIInputTextPopoverParams): UseAIInputTextPopoverReturn {
  const [textState, setTextState] = React.useState<TextProcessingState>('idle');
  const [inputValue, setInputValue] = React.useState('');
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (isPopoverOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isPopoverOpen]);

  const handlePopoverOpenChange = React.useCallback((open: boolean) => {
    if (textState === 'processing') return;
    setIsPopoverOpen(open);
    if (open) {
      setTextState('open');
      setInputValue('');
    } else {
      setTextState('idle');
    }
  }, [textState]);

  const handleTextSubmit = React.useCallback(async () => {
    if (!inputValue.trim() || textState === 'processing') return;

    setTextState('processing');

    try {
      const { data, error } = await supabase().functions.invoke('ai-voice-prompt', {
        body: {
          textInstructions: inputValue.trim(),
          task: 'transcribe_and_write',
          context: context || '',
          example: example || '',
          existingValue: existingValue || '',
        },
      });

      if (error) {
        normalizeAndPresentError(error, { context: 'AIInputButton', showToast: false });
        onError?.(error.message || 'Failed to process instructions');
        setTextState('open');
        return;
      }

      if (data?.error) {
        normalizeAndPresentError(new Error(data.error), { context: 'AIInputButton', showToast: false });
        onError?.(data.error);
        setTextState('open');
        return;
      }

      onResult?.({
        transcription: data.transcription,
        prompt: data.prompt,
      });

      setTextState('success');

      setTimeout(() => {
        setIsPopoverOpen(false);
        setTextState('idle');
        setInputValue('');
      }, 500);
    } catch (err: unknown) {
      normalizeAndPresentError(err, { context: 'AIInputButton', showToast: false });
      onError?.(getErrorMessage(err) || 'Failed to process instructions');
      setTextState('open');
    }
  }, [context, example, existingValue, inputValue, onError, onResult, textState]);

  const handleKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleTextSubmit();
    }
    if (e.key === 'Escape') {
      setIsPopoverOpen(false);
    }
  }, [handleTextSubmit]);

  return {
    textState,
    inputValue,
    setInputValue,
    isPopoverOpen,
    setIsPopoverOpen,
    inputRef,
    handlePopoverOpenChange,
    handleTextSubmit,
    handleKeyDown,
  };
}
