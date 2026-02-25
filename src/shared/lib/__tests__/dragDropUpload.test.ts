import { describe, it, expect, vi } from 'vitest';
import {
  createSingleFileDropHandler,
  preventDefaultDragOver,
} from '@/shared/lib/dnd/dragDropUpload';

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: vi.fn() },
}));

function makeDragEvent(files: File[]): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: { files },
  } as unknown as React.DragEvent;
}

describe('preventDefaultDragOver', () => {
  it('prevents default and stops propagation', () => {
    const event = makeDragEvent([]);
    preventDefaultDragOver(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });
});

describe('createSingleFileDropHandler', () => {
  it('calls upload for valid file type', async () => {
    const resetDrag = vi.fn();
    const upload = vi.fn().mockResolvedValue({ url: 'test.jpg' });
    const onResult = vi.fn();
    const execute = vi.fn().mockImplementation(async (fn) => fn());

    const handler = createSingleFileDropHandler({
      mimePrefix: 'image/',
      mimeErrorMessage: 'Please drop an image file',
      resetDrag,
      getProjectId: () => 'project-1',
      upload,
      onResult,
      context: 'test',
      toastTitle: 'Upload failed',
      uploadOperation: { execute },
    });

    const file = new File(['data'], 'photo.jpg', { type: 'image/jpeg' });
    await handler(makeDragEvent([file]));

    expect(resetDrag).toHaveBeenCalled();
    expect(execute).toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith({ url: 'test.jpg' });
  });

  it('shows error toast for wrong file type', async () => {
    const { toast } = await import('@/shared/components/ui/runtime/sonner');
    const resetDrag = vi.fn();

    const handler = createSingleFileDropHandler({
      mimePrefix: 'image/',
      mimeErrorMessage: 'Please drop an image file',
      resetDrag,
      getProjectId: () => 'project-1',
      upload: vi.fn(),
      onResult: vi.fn(),
      context: 'test',
      toastTitle: 'Upload failed',
      uploadOperation: { execute: vi.fn() },
    });

    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' });
    await handler(makeDragEvent([file]));
    expect(toast.error).toHaveBeenCalledWith('Please drop an image file');
  });
});
