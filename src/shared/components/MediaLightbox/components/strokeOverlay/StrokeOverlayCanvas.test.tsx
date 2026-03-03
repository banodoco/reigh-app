import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { StrokeOverlayCanvas } from './StrokeOverlayCanvas';

const mocks = vi.hoisted(() => ({
  Stage: vi.fn(
    ({
      children,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    }: {
      children?: ReactNode;
      onPointerDown?: (event: unknown) => void;
      onPointerMove?: (event: unknown) => void;
      onPointerUp?: (event: unknown) => void;
    }) => (
      <div
        data-testid="stage"
        onPointerDown={() => onPointerDown?.({ type: 'down' })}
        onPointerMove={() => onPointerMove?.({ type: 'move' })}
        onPointerUp={() => onPointerUp?.({ type: 'up' })}
      >
        {children}
      </div>
    ),
  ),
  Layer: vi.fn(({ children }: { children?: ReactNode }) => <div data-testid="layer">{children}</div>),
  Line: vi.fn(() => <div data-testid="line" />),
  Rect: vi.fn(() => <div data-testid="rect" />),
}));

vi.mock('react-konva', () => ({
  Stage: (props: unknown) => mocks.Stage(props),
  Layer: (props: unknown) => mocks.Layer(props),
  Line: (props: unknown) => mocks.Line(props),
  Rect: (props: unknown) => mocks.Rect(props),
}));

describe('StrokeOverlayCanvas', () => {
  const baseProps = {
    displayWidth: 320,
    displayHeight: 180,
    strokes: [] as never[],
    currentStroke: [] as Array<{ x: number; y: number }>,
    selectedShapeId: null as string | null,
    annotationMode: null as 'rectangle' | null,
    isEraseMode: false,
    brushSize: 4,
    scaleX: 2,
    toStage: (x: number, y: number) => ({ x, y }),
    onPointerDown: vi.fn(),
    onPointerMove: vi.fn(),
    onPointerUp: vi.fn(),
  };

  it('returns null when dimensions are zero', () => {
    const { container } = render(
      <StrokeOverlayCanvas
        {...baseProps}
        displayWidth={0}
        displayHeight={0}
      />,
    );

    expect(container.firstChild).toBeNull();
    expect(mocks.Stage).not.toHaveBeenCalled();
  });

  it('wires stage pointer handlers and renders persisted + current strokes', () => {
    render(
      <StrokeOverlayCanvas
        {...baseProps}
        strokes={[
          {
            id: 'rect-1',
            shapeType: 'rectangle',
            points: [{ x: 10, y: 20 }, { x: 30, y: 60 }],
            isFreeForm: false,
            isErasing: false,
            brushSize: 3,
          },
          {
            id: 'line-1',
            shapeType: 'free',
            points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
            isFreeForm: false,
            isErasing: true,
            brushSize: 5,
          },
        ] as never}
        currentStroke={[
          { x: 5, y: 5 },
          { x: 25, y: 25 },
        ]}
        annotationMode="rectangle"
      />,
    );

    const stage = screen.getByTestId('stage');
    fireEvent.pointerDown(stage);
    fireEvent.pointerMove(stage);
    fireEvent.pointerUp(stage);

    expect(baseProps.onPointerDown).toHaveBeenCalledTimes(1);
    expect(baseProps.onPointerMove).toHaveBeenCalledTimes(1);
    expect(baseProps.onPointerUp).toHaveBeenCalledTimes(1);

    expect(mocks.Rect).toHaveBeenCalledTimes(2);
    expect(mocks.Line).toHaveBeenCalledTimes(1);

    const persistedRect = mocks.Rect.mock.calls[0][0];
    expect(persistedRect).toEqual(
      expect.objectContaining({
        x: 10,
        y: 20,
        width: 20,
        height: 40,
      }),
    );

    const currentRect = mocks.Rect.mock.calls[1][0];
    expect(currentRect).toEqual(expect.objectContaining({ dash: [5, 5] }));

    const persistedLine = mocks.Line.mock.calls[0][0];
    expect(persistedLine).toEqual(
      expect.objectContaining({
        globalCompositeOperation: 'destination-out',
        strokeWidth: 10,
      }),
    );
  });
});
