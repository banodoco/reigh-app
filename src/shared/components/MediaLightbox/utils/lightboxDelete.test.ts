import { describe, expect, it, vi } from 'vitest';
import { invokeLightboxDelete } from './lightboxDelete';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

describe('invokeLightboxDelete', () => {
  it('calls delete handler with media id when successful', async () => {
    const onDelete = vi.fn(async () => undefined);

    await invokeLightboxDelete(onDelete, 'media-1', 'ImageLightbox.delete');

    expect(onDelete).toHaveBeenCalledWith('media-1');
    expect(mocks.normalizeAndPresentError).not.toHaveBeenCalled();
  });

  it('normalizes delete errors with a standard toast title', async () => {
    const error = new Error('delete failed');
    const onDelete = vi.fn(async () => {
      throw error;
    });

    await invokeLightboxDelete(onDelete, 'media-2', 'VideoLightbox.delete');

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(error, {
      context: 'VideoLightbox.delete',
      toastTitle: 'Delete Failed',
    });
  });
});
