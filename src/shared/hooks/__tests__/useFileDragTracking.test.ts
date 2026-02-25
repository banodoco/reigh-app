import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileDragTracking, preventDefaultDragOver, createSingleFileDropHandler } from '../useFileDragTracking';

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: vi.fn() },
}));

function makeDragEvent(types: string[]): React.DragEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    dataTransfer: {
      types,
      files: [],
    },
  } as unknown as React.DragEvent;
}

describe('useFileDragTracking', () => {
  it('starts with isDraggingOver false and no matchedType', () => {
    const { result } = renderHook(() => useFileDragTracking());
    expect(result.current.isDraggingOver).toBe(false);
    expect(result.current.matchedType).toBeNull();
  });

  it('sets isDraggingOver on drag enter with matching type', () => {
    const { result } = renderHook(() => useFileDragTracking(['Files']));
    const event = makeDragEvent(['Files']);

    act(() => {
      result.current.handleDragEnter(event);
    });

    expect(result.current.isDraggingOver).toBe(true);
    expect(result.current.matchedType).toBe('Files');
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it('does not set isDraggingOver for non-matching types', () => {
    const { result } = renderHook(() => useFileDragTracking(['Files']));
    const event = makeDragEvent(['text/plain']);

    act(() => {
      result.current.handleDragEnter(event);
    });

    expect(result.current.isDraggingOver).toBe(false);
    expect(result.current.matchedType).toBeNull();
  });

  it('handles nested drag enter/leave with counter', () => {
    const { result } = renderHook(() => useFileDragTracking());

    const enterEvent = makeDragEvent(['Files']);
    const leaveEvent = makeDragEvent([]);

    // Enter parent
    act(() => {
      result.current.handleDragEnter(enterEvent);
    });
    expect(result.current.isDraggingOver).toBe(true);

    // Enter child (nested)
    act(() => {
      result.current.handleDragEnter(enterEvent);
    });
    expect(result.current.isDraggingOver).toBe(true);

    // Leave child
    act(() => {
      result.current.handleDragLeave(leaveEvent);
    });
    expect(result.current.isDraggingOver).toBe(true); // Still dragging, counter > 0

    // Leave parent
    act(() => {
      result.current.handleDragLeave(leaveEvent);
    });
    expect(result.current.isDraggingOver).toBe(false); // Counter reached 0
  });

  it('resetDrag clears all state', () => {
    const { result } = renderHook(() => useFileDragTracking());
    const event = makeDragEvent(['Files']);

    act(() => {
      result.current.handleDragEnter(event);
      result.current.handleDragEnter(event);
    });
    expect(result.current.isDraggingOver).toBe(true);

    act(() => {
      result.current.resetDrag();
    });
    expect(result.current.isDraggingOver).toBe(false);
    expect(result.current.matchedType).toBeNull();
  });

  it('supports custom accepted types', () => {
    const { result } = renderHook(() => useFileDragTracking(['text/plain', 'text/html']));

    const event = makeDragEvent(['text/plain']);
    act(() => {
      result.current.handleDragEnter(event);
    });
    expect(result.current.isDraggingOver).toBe(true);
    expect(result.current.matchedType).toBe('text/plain');
  });
});

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
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { files: [file] },
    } as unknown as React.DragEvent;

    await handler(event);

    expect(resetDrag).toHaveBeenCalled();
    expect(execute).toHaveBeenCalled();
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
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      dataTransfer: { files: [file] },
    } as unknown as React.DragEvent;

    await handler(event);
    expect(toast.error).toHaveBeenCalledWith('Please drop an image file');
  });
});
