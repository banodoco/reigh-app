import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent, DragEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileInputController } from './useFileInputController';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    info: (...args: unknown[]) => mocks.toastInfo(...args),
  },
}));

function toFileList(files: File[]): FileList {
  const list = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    ...files.reduce<Record<number, File>>((acc, file, index) => {
      acc[index] = file;
      return acc;
    }, {}),
  };
  return list as unknown as FileList;
}

function makeFile(name: string, type: string): File {
  return new File(['binary'], name, { type });
}

describe('useFileInputController', () => {
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    createObjectURLMock = vi.fn((file: File) => `blob:${file.name}`);
    revokeObjectURLMock = vi.fn();
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = createObjectURLMock;
    URL.revokeObjectURL = revokeObjectURLMock;
  });

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    vi.useRealTimers();
  });

  it('derives accepted mime list and uses current file fallback in single mode', () => {
    const { result } = renderHook(() =>
      useFileInputController({
        onFileChange: vi.fn(),
        onFileRemove: vi.fn(),
        acceptTypes: ['image', 'video'],
        currentFilePreviewUrl: 'https://assets/current.png',
        currentFileName: 'current.png',
        disabled: false,
        multiple: false,
        showLoaderDuringSingleSelection: false,
        loaderDurationMs: 300,
        forceLoading: true,
      }),
    );

    expect(result.current.acceptedMimeTypes).toBe('image/*,video/*');
    expect(result.current.displayFiles).toEqual([
      expect.objectContaining({
        name: 'current.png',
        type: 'image/png',
      }),
    ]);
    expect(result.current.displayPreviewUrls).toEqual(['https://assets/current.png']);
    expect(result.current.showLoader).toBe(true);
  });

  it('filters invalid files in single mode, shows selection loader, and resets it on timer', () => {
    vi.useFakeTimers();
    const onFileChange = vi.fn();
    const onFileRemove = vi.fn();
    const { result } = renderHook(() =>
      useFileInputController({
        onFileChange,
        onFileRemove,
        acceptTypes: ['image'],
        currentFilePreviewUrl: null,
        currentFileName: null,
        disabled: false,
        multiple: false,
        showLoaderDuringSingleSelection: true,
        loaderDurationMs: 500,
        forceLoading: false,
      }),
    );

    const imageA = makeFile('a.png', 'image/png');
    const imageB = makeFile('b.png', 'image/png');
    const video = makeFile('clip.mp4', 'video/mp4');
    const files = toFileList([imageA, imageB, video]);

    act(() => {
      result.current.fileInputRef.current = { value: 'seed' } as HTMLInputElement;
      result.current.handleInputChange({ target: { files } } as ChangeEvent<HTMLInputElement>);
    });

    expect(mocks.toastError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid file type for: clip.mp4. Accepted: image.'),
    );
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      "Multiple files selected, but only the first one will be used as 'multiple' is not enabled.",
    );
    expect(onFileChange).toHaveBeenLastCalledWith([imageA]);
    expect(result.current.displayFiles).toEqual([imageA]);
    expect(result.current.displayPreviewUrls).toEqual(['blob:a.png']);
    expect(result.current.fileInputRef.current?.value).toBe('');
    expect(result.current.showLoader).toBe(true);
    expect(createObjectURLMock).toHaveBeenCalledWith(imageA);
    expect(onFileRemove).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.showLoader).toBe(false);
  });

  it('supports drag/drop and remove operations in multiple mode', () => {
    const onFileChange = vi.fn();
    const onFileRemove = vi.fn();
    const clearData = vi.fn();
    const { result } = renderHook(() =>
      useFileInputController({
        onFileChange,
        onFileRemove,
        acceptTypes: ['image', 'video'],
        currentFilePreviewUrl: null,
        currentFileName: null,
        disabled: false,
        multiple: true,
        showLoaderDuringSingleSelection: true,
        loaderDurationMs: 500,
        forceLoading: false,
      }),
    );

    const image = makeFile('image.png', 'image/png');
    const video = makeFile('video.mp4', 'video/mp4');
    const fileList = toFileList([image, video]);
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    act(() => {
      result.current.handleDragOver({
        preventDefault,
        stopPropagation,
      } as unknown as DragEvent<HTMLDivElement>);
    });
    expect(result.current.isDraggingOver).toBe(true);

    act(() => {
      result.current.handleDrop({
        preventDefault,
        stopPropagation,
        dataTransfer: {
          files: fileList,
          clearData,
        },
      } as unknown as DragEvent<HTMLDivElement>);
    });

    expect(clearData).toHaveBeenCalledTimes(1);
    expect(onFileChange).toHaveBeenLastCalledWith([image, video]);
    expect(result.current.displayFiles).toEqual([image, video]);

    act(() => {
      result.current.handleRemoveFile(0);
    });
    expect(onFileChange).toHaveBeenLastCalledWith([video]);
    expect(onFileRemove).not.toHaveBeenCalled();

    act(() => {
      result.current.handleRemoveAllFiles();
    });
    expect(onFileChange).toHaveBeenLastCalledWith([]);
    expect(onFileRemove).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.handleDragLeave({
        preventDefault,
        stopPropagation,
      } as unknown as DragEvent<HTMLDivElement>);
    });
    expect(result.current.isDraggingOver).toBe(false);
  });
});
