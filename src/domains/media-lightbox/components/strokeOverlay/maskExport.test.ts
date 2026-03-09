// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BrushStroke } from '@/domains/media-lightbox/hooks/inpainting/types';
import { exportStrokeMask } from './maskExport';

const mocks = vi.hoisted(() => {
  const stageAdd = vi.fn();
  const stageToDataURL = vi.fn().mockReturnValue('data:image/png;base64,mask');
  const stageDestroy = vi.fn();
  const layerAdd = vi.fn();
  const layerDraw = vi.fn();

  const Stage = vi.fn(function Stage() {
    return {
      add: stageAdd,
      toDataURL: stageToDataURL,
      destroy: stageDestroy,
    };
  });
  const Layer = vi.fn(function Layer() {
    return {
      add: layerAdd,
      draw: layerDraw,
    };
  });
  const Rect = vi.fn(function Rect(config: Record<string, unknown>) {
    return {
      kind: 'rect',
      config,
    };
  });
  const Line = vi.fn(function Line(config: Record<string, unknown>) {
    return {
      kind: 'line',
      config,
    };
  });

  return {
    Stage,
    Layer,
    Rect,
    Line,
    stageAdd,
    stageToDataURL,
    stageDestroy,
    layerAdd,
    layerDraw,
    normalizeAndPresentError: vi.fn(),
  };
});

vi.mock('konva', () => ({
  default: {
    Stage: mocks.Stage,
    Layer: mocks.Layer,
    Rect: mocks.Rect,
    Line: mocks.Line,
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

describe('exportStrokeMask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stageToDataURL.mockReturnValue('data:image/png;base64,mask');
    mocks.Stage.mockImplementation(function Stage() {
      return {
        add: mocks.stageAdd,
        toDataURL: mocks.stageToDataURL,
        destroy: mocks.stageDestroy,
      };
    });
  });

  it('returns null when there are no strokes', () => {
    const result = exportStrokeMask({
      strokes: [],
      imageWidth: 100,
      imageHeight: 80,
    });

    expect(result).toBeNull();
    expect(mocks.Stage).not.toHaveBeenCalled();
  });

  it('exports mask png with background and provided strokes', () => {
    const strokes: BrushStroke[] = [
      {
        id: 'line-1',
        points: [{ x: 1, y: 2 }, { x: 3, y: 4 }],
        isErasing: false,
        brushSize: 5,
        shapeType: 'line',
      },
      {
        id: 'rect-1',
        points: [{ x: 10, y: 10 }, { x: 16, y: 18 }],
        isErasing: false,
        brushSize: 1,
        shapeType: 'rectangle',
      },
      {
        id: 'free-rect-1',
        points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
        isErasing: false,
        brushSize: 1,
        shapeType: 'rectangle',
        isFreeForm: true,
      },
    ];

    const beforeCount = document.body.children.length;
    const result = exportStrokeMask({
      strokes,
      imageWidth: 1920,
      imageHeight: 1080,
    });
    const afterCount = document.body.children.length;

    expect(result).toBe('data:image/png;base64,mask');
    expect(afterCount).toBe(beforeCount);
    expect(mocks.Stage).toHaveBeenCalledWith(
      expect.objectContaining({
        width: 1920,
        height: 1080,
      }),
    );
    expect(mocks.stageToDataURL).toHaveBeenCalledWith({
      pixelRatio: 1.5,
      mimeType: 'image/png',
    });
    expect(mocks.stageDestroy).toHaveBeenCalledTimes(1);
    expect(mocks.layerDraw).toHaveBeenCalledTimes(1);

    expect(mocks.Rect).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 0,
        y: 0,
        width: 1920,
        height: 1080,
        fill: 'black',
      }),
    );
    expect(mocks.Line).toHaveBeenCalledWith(
      expect.objectContaining({
        points: [1, 2, 3, 4],
        stroke: 'white',
        strokeWidth: 5,
      }),
    );
    expect(mocks.Rect).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 10,
        y: 10,
        width: 6,
        height: 8,
        stroke: 'white',
        strokeWidth: 6,
      }),
    );
    expect(mocks.Line).toHaveBeenCalledWith(
      expect.objectContaining({
        points: [0, 0, 4, 0, 4, 4, 0, 4],
        stroke: 'white',
        strokeWidth: 6,
        closed: true,
      }),
    );
  });

  it('returns null and normalizes errors when Konva export fails', () => {
    mocks.Stage.mockImplementationOnce(function Stage() {
      throw new Error('konva fail');
    });

    const result = exportStrokeMask({
      strokes: [
        {
          id: 'line-1',
          points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
          isErasing: false,
          brushSize: 2,
          shapeType: 'line',
        },
      ],
      imageWidth: 10,
      imageHeight: 10,
    });

    expect(result).toBeNull();
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'StrokeOverlay.exportMask',
        showToast: false,
      }),
    );
  });
});
