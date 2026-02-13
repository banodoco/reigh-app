import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/shared/components/ui/sonner', () => ({
  toast: { info: vi.fn(), error: vi.fn() },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/lib/errorUtils', () => ({
  isAbortError: vi.fn((error: unknown) => error instanceof Error && error.name === 'AbortError'),
}));

import { downloadMedia } from '../download';

describe('downloadMedia', () => {
  let mockLink: { href: string; download: string; target: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockLink = {
      href: '',
      download: '',
      target: '',
      click: vi.fn(),
    };

    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'contains').mockReturnValue(true);

    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    globalThis.URL.revokeObjectURL = vi.fn();

    // Default: not iOS PWA
    Object.defineProperty(window.navigator, 'standalone', { value: false, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('downloads and creates a link with correct filename from prompt', async () => {
    const mockBlob = new Blob(['test'], { type: 'image/png' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const downloadPromise = downloadMedia(
      'https://example.com/image.png',
      'abcdef12-3456-7890',
      false,
      'image/png',
      'A beautiful sunset over the ocean'
    );

    await downloadPromise;

    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.download).toContain('A_beautiful_sunset_over_the_ocean');
    expect(mockLink.download).toContain('abcdef12');
    expect(mockLink.download).toMatch(/\.png$/);
  });

  it('uses media_<shortId> format when no prompt', async () => {
    const mockBlob = new Blob(['test'], { type: 'image/png' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    await downloadMedia('https://example.com/image.png', 'abcdef12-long-id', false);

    expect(mockLink.download).toBe('media_abcdef12.png');
  });

  it('uses content type for extension when available', async () => {
    const mockBlob = new Blob(['test'], { type: 'video/mp4' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    await downloadMedia('https://example.com/video', 'abcdef12-long', true, 'video/mp4');

    expect(mockLink.download).toContain('.mp4');
  });

  it('extracts extension from URL when no content type', async () => {
    const mockBlob = new Blob(['test']);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    await downloadMedia('https://example.com/file.webm?token=abc', 'abcdef12-long', true);

    expect(mockLink.download).toContain('.webm');
  });

  it('defaults to mp4 for video and png for image', async () => {
    const mockBlob = new Blob(['test']);
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    await downloadMedia('https://example.com/no-ext', 'abcdef12-long', true);
    expect(mockLink.download).toContain('.mp4');
  });

  it('falls back to direct link on fetch error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    await downloadMedia('https://example.com/image.png', 'abcdef12-long', false);

    // Should create a fallback link
    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.href).toBe('https://example.com/image.png');
  });

  it('handles HTTP error responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });

    await downloadMedia('https://example.com/missing.png', 'abcdef12-long', false);

    // Should attempt fallback
    expect(mockLink.click).toHaveBeenCalled();
  });

  it('sanitizes filename by removing special characters', async () => {
    const mockBlob = new Blob(['test'], { type: 'image/png' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    await downloadMedia(
      'https://example.com/image.png',
      'abcdef12-long',
      false,
      'image/png',
      'A "dangerous" <prompt> with/slashes'
    );

    expect(mockLink.download).not.toContain('"');
    expect(mockLink.download).not.toContain('<');
    expect(mockLink.download).not.toContain('>');
    expect(mockLink.download).not.toContain('/');
  });

  it('truncates long prompt-based filenames', async () => {
    const mockBlob = new Blob(['test'], { type: 'image/png' });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(mockBlob),
    });

    const longPrompt = 'a'.repeat(200);
    await downloadMedia(
      'https://example.com/image.png',
      'abcdef12-long',
      false,
      'image/png',
      longPrompt
    );

    // Sanitized prompt portion is capped at 40 chars, plus _shortId.ext
    const promptPart = mockLink.download.split('_abcdef12')[0];
    expect(promptPart.length).toBeLessThanOrEqual(40);
  });
});
