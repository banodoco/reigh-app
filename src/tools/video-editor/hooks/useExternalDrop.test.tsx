// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GENERATION_MULTI_DRAG_TYPE,
  setMultiGenerationDragData,
  type GenerationDropData,
} from '@/shared/lib/dnd/dragDrop';
import { useExternalDrop } from './useExternalDrop';

function createStoredDragPayload(items: GenerationDropData[]) {
  const storedData: Record<string, string> = {};
  const dragStartEvent = {
    dataTransfer: {
      effectAllowed: 'none',
      setData: (type: string, value: string) => {
        storedData[type] = value;
      },
    },
  } as unknown as React.DragEvent;

  setMultiGenerationDragData(dragStartEvent, items);
  return storedData;
}

function createDropEvent(data: Record<string, string>, types: string[] = [GENERATION_MULTI_DRAG_TYPE, 'text/plain']) {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientX: 120,
    clientY: 48,
    currentTarget: { dataset: {} as Record<string, string> },
    dataTransfer: {
      types,
      files: [],
      items: [],
      getData: (type: string) => data[type] ?? '',
      setData: vi.fn(),
    },
  } as unknown as React.DragEvent<HTMLDivElement>;
}

function createFileDropEvent(files: File[]) {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    clientX: 120,
    clientY: 48,
    currentTarget: { dataset: {} as Record<string, string> },
    dataTransfer: {
      types: ['Files'],
      files,
      items: [],
      getData: vi.fn(() => ''),
      setData: vi.fn(),
    },
  } as unknown as React.DragEvent<HTMLDivElement>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}

type DropTestData = {
  tracks: Array<{ id: string; kind: 'visual'; label: string }>;
  rows: Array<{ id: string; actions: Array<{ id: string; start: number; end: number; effectId: string }> }>;
  registry: { assets: Record<string, { file: string; type?: string; duration?: number }> };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useExternalDrop', () => {
  it('accepts generation-multi drags during drag over', () => {
    const dataRef = { current: null } as React.MutableRefObject<DropTestData | null>;
    const pendingOpsRef = { current: 0 } as React.MutableRefObject<number>;
    const event = createDropEvent({
      [GENERATION_MULTI_DRAG_TYPE]: JSON.stringify([{
        generationId: 'gen-1',
        imageUrl: 'https://example.com/image.png',
      }]),
      'text/plain': '__reigh_generation_multi__:[{"generationId":"gen-1","imageUrl":"https://example.com/image.png"}]',
    });

    const coordinator = {
      update: vi.fn(() => ({
        time: 0,
        rowIndex: 0,
        trackId: 'V1',
        trackKind: 'visual',
        trackName: 'V1',
        isNewTrack: false,
        isReject: false,
        isNewTrackTop: false,
        newTrackKind: null,
        screenCoords: {
          rowTop: 0,
          rowLeft: 0,
          rowWidth: 0,
          rowHeight: 0,
          clipLeft: 0,
          clipWidth: 0,
          ghostCenter: 0,
        },
      })),
      showSecondaryGhosts: vi.fn(),
      end: vi.fn(),
      lastPosition: null,
      editAreaRef: { current: null },
    };

    const { result } = renderHook(() => useExternalDrop({
      dataRef,
      pendingOpsRef,
      scale: 1,
      scaleWidth: 1,
      selectedTrackId: null,
      applyEdit: vi.fn(),
      patchRegistry: vi.fn(),
      registerAsset: vi.fn(),
      uploadAsset: vi.fn(),
      invalidateAssetRegistry: vi.fn(),
      resolveAssetUrl: vi.fn(),
      coordinator,
      registerGenerationAsset: vi.fn(),
      uploadImageGeneration: vi.fn(),
      handleAssetDrop: vi.fn(),
    }));

    result.current.onTimelineDragOver(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.currentTarget.dataset.dragOver).toBe('true');
  });

  it('drops multi-generation payloads sequentially and checks the multi payload before the single payload', async () => {
    const dataRef = {
      current: {
        tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
        rows: [],
        registry: { assets: {} as Record<string, { file: string; type?: string; duration?: number }> },
      },
    } as React.MutableRefObject<DropTestData>;
    const pendingOpsRef = { current: 0 } as React.MutableRefObject<number>;

    const patchRegistry = vi.fn((assetId: string, entry: { file: string; type?: string; duration?: number }) => {
      dataRef.current.registry.assets[assetId] = entry;
    });
    const registerGenerationAsset = vi.fn((generation: GenerationDropData) => {
      const assetId = `asset-${generation.generationId}`;
      const type = generation.variantType === 'video' ? 'video/mp4' : 'image/png';
      dataRef.current.registry.assets[assetId] = {
        file: generation.imageUrl,
        type,
      };
      return assetId;
    });
    const handleAssetDrop = vi.fn((
      _assetKey: string,
      trackId: string | undefined,
      _time: number,
      forceNewTrack?: boolean,
      insertAtTop?: boolean,
    ) => {
      if (!forceNewTrack) {
        return;
      }

      const newTrack = { id: 'V2', kind: 'visual', label: 'V2' };
      dataRef.current = {
        ...dataRef.current,
        tracks: insertAtTop
          ? [newTrack, ...dataRef.current.tracks]
          : [...dataRef.current.tracks, newTrack],
      };

      if (trackId) {
        throw new Error('expected first multi-drop to create a new track');
      }
    });

    const coordinator = {
      update: vi.fn(),
      showSecondaryGhosts: vi.fn(),
      end: vi.fn(),
      lastPosition: {
        time: 12,
        rowIndex: 0,
        trackId: undefined,
        trackKind: 'visual',
        trackName: '',
        isNewTrack: true,
        isNewTrackTop: false,
        isReject: false,
        newTrackKind: 'visual',
        screenCoords: {
          rowTop: 0,
          rowLeft: 0,
          rowWidth: 0,
          rowHeight: 0,
          clipLeft: 0,
          clipWidth: 0,
          ghostCenter: 0,
        },
      },
      editAreaRef: { current: null },
    };

    const { result } = renderHook(() => useExternalDrop({
      dataRef,
      pendingOpsRef,
      scale: 1,
      scaleWidth: 1,
      selectedTrackId: null,
      applyEdit: vi.fn(),
      patchRegistry,
      registerAsset: vi.fn(),
      uploadAsset: vi.fn(),
      invalidateAssetRegistry: vi.fn(),
      resolveAssetUrl: vi.fn(),
      coordinator,
      registerGenerationAsset,
      uploadImageGeneration: vi.fn(),
      handleAssetDrop,
    }));

    const multiItems: GenerationDropData[] = [
      {
        generationId: 'gen-video',
        variantType: 'video',
        imageUrl: 'https://example.com/video.mp4',
        metadata: {
          content_type: 'video/mp4',
          duration_seconds: 8,
        },
      },
      {
        generationId: 'gen-image',
        variantType: 'image',
        imageUrl: 'https://example.com/image.png',
        metadata: {
          content_type: 'image/png',
        },
      },
    ];
    const storedData = createStoredDragPayload(multiItems);
    const event = createDropEvent(storedData);

    await result.current.onTimelineDrop(event);

    expect(registerGenerationAsset).toHaveBeenCalledTimes(2);
    expect(handleAssetDrop).toHaveBeenNthCalledWith(1, 'asset-gen-video', undefined, 12, true, false);
    expect(handleAssetDrop).toHaveBeenNthCalledWith(2, 'asset-gen-image', 'V2', 20, false, false);
    expect(patchRegistry).toHaveBeenCalledWith('asset-gen-video', {
      file: 'https://example.com/video.mp4',
      type: 'video/mp4',
      duration: 8,
    }, 'https://example.com/video.mp4');
  });

  it('tracks pending uploads per file until each async upload settles', async () => {
    const dataRef = {
      current: {
        tracks: [{ id: 'V1', kind: 'visual', label: 'V1' }],
        rows: [{ id: 'V1', actions: [] }],
        registry: { assets: {} as Record<string, { file: string; type?: string; duration?: number }> },
      },
    } as React.MutableRefObject<DropTestData>;
    const pendingOpsRef = { current: 0 } as React.MutableRefObject<number>;
    const firstUpload = deferred<{ assetId: string; entry: { file: string; type: string } }>();
    const secondUpload = deferred<{ assetId: string; entry: { file: string; type: string } }>();
    const uploadQueue = [firstUpload, secondUpload];

    const applyEdit = vi.fn();
    const uploadAsset = vi
      .fn<(file: File) => Promise<{ assetId: string; entry: { file: string; type: string } }>>()
      .mockImplementation(() => {
        const nextUpload = uploadQueue.shift();
        if (!nextUpload) {
          throw new Error('unexpected upload');
        }

        return nextUpload.promise;
      });
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const coordinator = {
      update: vi.fn(),
      showSecondaryGhosts: vi.fn(),
      end: vi.fn(),
      lastPosition: {
        time: 12,
        rowIndex: 0,
        trackId: 'V1',
        trackKind: 'visual',
        trackName: 'V1',
        isNewTrack: false,
        isNewTrackTop: false,
        isReject: false,
        newTrackKind: null,
        screenCoords: {
          rowTop: 0,
          rowLeft: 0,
          rowWidth: 0,
          rowHeight: 0,
          clipLeft: 0,
          clipWidth: 0,
          ghostCenter: 0,
        },
      },
      editAreaRef: { current: null },
    };

    const { result } = renderHook(() => useExternalDrop({
      dataRef,
      pendingOpsRef,
      scale: 1,
      scaleWidth: 1,
      selectedTrackId: null,
      applyEdit,
      patchRegistry: vi.fn(),
      registerAsset: vi.fn(),
      uploadAsset,
      invalidateAssetRegistry: vi.fn(),
      resolveAssetUrl: vi.fn(async (file: string) => `https://cdn.example/${file}`),
      coordinator,
      registerGenerationAsset: vi.fn(),
      uploadImageGeneration: vi.fn(),
      handleAssetDrop: vi.fn(),
    }));

    const event = createFileDropEvent([
      new File(['one'], 'one.mp4', { type: 'video/mp4' }),
      new File(['two'], 'two.mp4', { type: 'video/mp4' }),
    ]);

    await act(async () => {
      await result.current.onTimelineDrop(event);
    });

    expect(uploadAsset).toHaveBeenCalledTimes(2);
    expect(pendingOpsRef.current).toBe(2);

    firstUpload.resolve({
      assetId: 'asset-1',
      entry: { file: 'one.mp4', type: 'video/mp4' },
    });
    await waitFor(() => {
      expect(pendingOpsRef.current).toBe(1);
    });

    secondUpload.reject(new Error('upload failed'));
    await waitFor(() => {
      expect(pendingOpsRef.current).toBe(0);
    });

    expect(consoleError).toHaveBeenCalledWith('[drop] Upload failed:', expect.any(Error));
    expect(applyEdit).toHaveBeenCalled();
  });
});
