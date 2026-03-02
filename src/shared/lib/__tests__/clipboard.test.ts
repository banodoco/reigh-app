import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeClipboardTextSafe } from '../clipboard';

describe('writeClipboardTextSafe', () => {
  const originalClipboard = navigator.clipboard;
  const originalExecCommand = document.execCommand;

  afterEach(() => {
    Object.assign(navigator, { clipboard: originalClipboard });
    if (originalExecCommand) {
      Object.assign(document, { execCommand: originalExecCommand });
    } else {
      delete (document as Document & { execCommand?: typeof document.execCommand }).execCommand;
    }
    vi.restoreAllMocks();
  });

  it('returns false for empty text', async () => {
    await expect(writeClipboardTextSafe('')).resolves.toBe(false);
  });

  it('returns true when navigator clipboard write succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    await expect(writeClipboardTextSafe('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when fallback copy command reports failure', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('no clipboard permission')),
      },
    });
    Object.assign(document, {
      execCommand: vi.fn().mockReturnValue(false),
    });

    await expect(
      writeClipboardTextSafe('hello', { allowExecCommandFallback: true }),
    ).resolves.toBe(false);
  });

  it('returns true when fallback copy command succeeds', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('no clipboard permission')),
      },
    });
    Object.assign(document, {
      execCommand: vi.fn().mockReturnValue(true),
    });

    await expect(
      writeClipboardTextSafe('hello', { allowExecCommandFallback: true }),
    ).resolves.toBe(true);
  });
});
