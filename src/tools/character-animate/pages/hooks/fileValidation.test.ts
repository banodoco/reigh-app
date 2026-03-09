import { describe, expect, it, vi } from 'vitest';
import {
  hasSupportedImageItem,
  hasSupportedVideoItem,
  isSupportedImageType,
  isSupportedVideoType,
  withFirstFile,
} from './fileValidation';

function createFileList(files: File[]): FileList {
  return {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    ...files,
  } as unknown as FileList;
}

function createDataTransferItems(items: Array<{ kind: string; type: string }>): DataTransferItemList {
  return {
    length: items.length,
    ...items,
    [Symbol.iterator]: function* iterator() {
      yield* items;
    },
  } as unknown as DataTransferItemList;
}

describe('fileValidation', () => {
  it('withFirstFile no-ops when no file is present', async () => {
    const handler = vi.fn();

    await withFirstFile(null, handler);
    await withFirstFile(createFileList([]), handler);

    expect(handler).not.toHaveBeenCalled();
  });

  it('withFirstFile forwards only the first file', async () => {
    const first = new File(['a'], 'first.png', { type: 'image/png' });
    const second = new File(['b'], 'second.png', { type: 'image/png' });
    const handler = vi.fn();

    await withFirstFile(createFileList([first, second]), handler);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(first);
  });

  it('accepts the supported image mime types only', () => {
    expect(isSupportedImageType('image/png')).toBe(true);
    expect(isSupportedImageType('image/jpeg')).toBe(true);
    expect(isSupportedImageType('image/jpg')).toBe(true);
    expect(isSupportedImageType('image/webp')).toBe(false);
    expect(isSupportedImageType('video/mp4')).toBe(false);
  });

  it('accepts any video/* mime type', () => {
    expect(isSupportedVideoType('video/mp4')).toBe(true);
    expect(isSupportedVideoType('video/webm')).toBe(true);
    expect(isSupportedVideoType('image/png')).toBe(false);
  });

  it('detects supported drag items for image and video uploads', () => {
    const mixedItems = createDataTransferItems([
      { kind: 'string', type: 'text/plain' },
      { kind: 'file', type: 'image/jpeg' },
      { kind: 'file', type: 'video/mp4' },
    ]);

    expect(hasSupportedImageItem(mixedItems)).toBe(true);
    expect(hasSupportedVideoItem(mixedItems)).toBe(true);
  });

  it('ignores non-file and unsupported drag items', () => {
    const unsupportedItems = createDataTransferItems([
      { kind: 'string', type: 'text/plain' },
      { kind: 'file', type: 'application/pdf' },
    ]);

    expect(hasSupportedImageItem(unsupportedItems)).toBe(false);
    expect(hasSupportedVideoItem(unsupportedItems)).toBe(false);
  });
});
