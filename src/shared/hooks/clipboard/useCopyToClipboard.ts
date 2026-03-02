import { useState, useCallback } from 'react';
import { writeClipboardTextSafe } from '@/shared/lib/clipboard';

/**
 * Hook for copying text to clipboard with temporary visual feedback.
 */
export function useCopyToClipboard(text: string | undefined) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!text) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    void writeClipboardTextSafe(text);
  }, [text]);

  return { copied, handleCopy };
}
