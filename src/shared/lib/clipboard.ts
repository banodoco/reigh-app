/**
 * Best-effort clipboard write that never throws.
 * Returns true when the write succeeds.
 */
export async function writeClipboardTextSafe(
  text: string,
  options: { allowExecCommandFallback?: boolean } = {},
): Promise<boolean> {
  if (!text) {
    return false;
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to optional fallback
    }
  }

  if (!options.allowExecCommandFallback || typeof document === 'undefined') {
    return false;
  }

  let textarea: HTMLTextAreaElement | null = null;
  try {
    textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    if (textarea?.parentNode) {
      textarea.parentNode.removeChild(textarea);
    }
  }
}
