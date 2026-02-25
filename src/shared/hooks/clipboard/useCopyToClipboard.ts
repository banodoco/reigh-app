import { useState, useCallback } from 'react';

/**
 * Hook for copying text to clipboard with temporary visual feedback.
 */
export function useCopyToClipboard(text: string | undefined) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!text) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    navigator.clipboard.writeText(text).catch(() => {
      // Silently fail - we already showed feedback
    });
  }, [text]);

  return { copied, handleCopy };
}
