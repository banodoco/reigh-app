/**
 * Best-effort clipboard write that never throws.
 * Returns true when the write succeeds.
 */
export async function writeClipboardTextSafe(text: string): Promise<boolean> {
  if (!text || !navigator.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
