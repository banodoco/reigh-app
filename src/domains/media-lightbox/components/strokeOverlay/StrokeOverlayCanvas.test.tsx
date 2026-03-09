// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { BrushStroke } from '@/domains/media-lightbox/hooks/inpainting/types';
import { StrokeOverlayCanvas } from './StrokeOverlayCanvas';

const mocks = vi.hoisted(() => ({
  stage: vi.fn(),
  layer: vi.fn(),
  line: vi.fn(),
  rect: vi.fn(),
}));

vi.mock('react-konva', () => ({
  Stage: (props: Record<string, unknown>) => {
    mocks.stage(props);
    return <div data-testid="stage">{props.children as unknown as JSX.Element}</div>;
  },
  Layer: (props: Record<string, unknown>) => {
    mocks.layer(props);
    return <div data-testid="layer">{props.children as unknown as JSX.Element}</div>;
  },
  Line: (props: Record<string, unknown>) => {
    mocks.line(props);
    return <div data-testid="line" />;
  },
  Rect: (props: Record<string, unknown>) => {
    mocks.rect(props);
    return <div data-testid="rect" />;
  },
}));

function createBaseProps() {
  return {
    displayWidth: 320,
    displayHeight: 180,
    strokes: [] as BrushStroke[],
    currentStroke: [] as Array<{ x: number; y: number }>,
    selectedShapeId: null as string | null,
    annotationMode: null as 'rectangle' | null,
    isEraseMode: false,
    brushSize: 2,
    scaleX: 1,
    toStage: (x: number, y: number) => ({ x, y }),
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
  };
}

describe('StrokeOverlayCanvas', () => {
  it('returns null when display dimensions are zero', () => {
    const props = createBaseProps();
    const { container } = render(
      <StrokeOverlayCanvas
        {...props}
        displayWidth={0}
      />,
    );

    expect(container.firstChild).toBeNull();
    expect(mocks.stage).not.toHaveBeenCalled();
  });

  it('renders rectangle strokes and current rectangle preview', () => {
    const props = createBaseProps();
    props.selectedShapeId = 'rect-1';
    props.strokes = [
      {
        id: 'rect-1',
        points: [{ x: 1, y: 2 }, { x: 4, y: 6 }],
        isErasing: false,
        brushSize: 3,
        shapeType: 'rectangle',
      },
    ];
    props.currentStroke = [{ x: 0, y: 0 }, { x: 2, y: 3 }];
    props.annotationMode = 'rectangle';

    render(<StrokeOverlayCanvas {...props} />);

    const stageProps = mocks.stage.mock.calls[0][0] as {
      width: number;
      height: number;
      onPointerDown: unknown;
      onPointerMove: unknown;
      onPointerUp: unknown;
      onPointerCancel: unknown;
    };
    expect(stageProps.width).toBe(320);
    expect(stageProps.height).toBe(180);
    expect(stageProps.onPointerDown).toBe(props.onPointerDown);
    expect(stageProps.onPointerMove).toBe(props.onPointerMove);
    expect(stageProps.onPointerUp).toBe(props.onPointerUp);
    expect(stageProps.onPointerCancel).toBe(props.onPointerUp);

    expect(mocks.rect).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        stroke: 'rgba(0, 255, 100, 0.9)',
      }),
    );
    expect(mocks.rect).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        x: 0,
        y: 0,
        width: 2,
        height: 3,
        dash: [5, 5],
      }),
    );
  });

  it('renders free-form and erase strokes as lines with expected drawing mode', () => {
    const props = createBaseProps();
    props.scaleX = 2;
    props.isEraseMode = true;
    props.toStage = (x: number, y: number) => ({ x: x * 2, y: y * 2 });
    props.strokes = [
      {
        id: 'free-rect',
        points: [{ x: 1, y: 1 }, { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 1, y: 2 }],
        isErasing: false,
        brushSize: 2,
        shapeType: 'rectangle',
        isFreeForm: true,
      },
      {
        id: 'erase-line',
        points: [{ x: 4, y: 4 }, { x: 5, y: 6 }],
        isErasing: true,
        brushSize: 2,
        shapeType: 'line',
      },
    ];
    props.currentStroke = [{ x: 6, y: 6 }, { x: 7, y: 8 }];

    render(<StrokeOverlayCanvas {...props} />);

    expect(mocks.line).toHaveBeenCalledWith(
      expect.objectContaining({
        closed: true,
        strokeWidth: 3,
      }),
    );
    expect(mocks.line).toHaveBeenCalledWith(
      expect.objectContaining({
        stroke: 'rgba(0, 0, 0, 1)',
        strokeWidth: 4,
        globalCompositeOperation: 'destination-out',
      }),
    );
    expect(mocks.line).toHaveBeenCalledWith(
      expect.objectContaining({
        stroke: 'rgba(0, 0, 0, 0.5)',
        strokeWidth: 4,
      }),
    );
  });
});
