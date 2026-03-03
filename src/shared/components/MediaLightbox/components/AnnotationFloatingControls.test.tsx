import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AnnotationFloatingControls } from './AnnotationFloatingControls';
import type { BrushStroke } from '../hooks/inpainting/types';

function buildStroke(overrides: Partial<BrushStroke> = {}): BrushStroke {
  return {
    id: 'shape-1',
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    isErasing: false,
    brushSize: 8,
    ...overrides,
  };
}

function renderControls(overrides: Partial<React.ComponentProps<typeof AnnotationFloatingControls>> = {}) {
  const onToggleFreeForm = vi.fn();
  const onDeleteSelected = vi.fn();

  render(
    <AnnotationFloatingControls
      selectedShapeId="shape-1"
      isAnnotateMode={true}
      brushStrokes={[buildStroke()]}
      getDeleteButtonPosition={() => ({ x: 120, y: 80 })}
      onToggleFreeForm={onToggleFreeForm}
      onDeleteSelected={onDeleteSelected}
      {...overrides}
    />,
  );

  return { onToggleFreeForm, onDeleteSelected };
}

describe('AnnotationFloatingControls', () => {
  it('renders nothing when no shape is selected or annotation mode is disabled', () => {
    const { container: noShape } = render(
      <AnnotationFloatingControls
        selectedShapeId={null}
        isAnnotateMode={true}
        brushStrokes={[buildStroke()]}
        getDeleteButtonPosition={() => ({ x: 0, y: 0 })}
        onToggleFreeForm={vi.fn()}
        onDeleteSelected={vi.fn()}
      />,
    );
    expect(noShape.firstChild).toBeNull();

    const { container: noAnnotateMode } = render(
      <AnnotationFloatingControls
        selectedShapeId="shape-1"
        isAnnotateMode={false}
        brushStrokes={[buildStroke()]}
        getDeleteButtonPosition={() => ({ x: 0, y: 0 })}
        onToggleFreeForm={vi.fn()}
        onDeleteSelected={vi.fn()}
      />,
    );
    expect(noAnnotateMode.firstChild).toBeNull();
  });

  it('renders controls at computed position and dispatches actions', () => {
    const { onToggleFreeForm, onDeleteSelected } = renderControls();

    const toggle = screen.getByTitle('Switch to free-form mode (rhombus/non-orthogonal angles)');
    const del = screen.getByTitle('Delete annotation (or press DELETE key)');

    fireEvent.click(toggle);
    fireEvent.click(del);

    expect(onToggleFreeForm).toHaveBeenCalledTimes(1);
    expect(onDeleteSelected).toHaveBeenCalledTimes(1);
  });

  it('shows free-form active title when selected shape is already free-form', () => {
    renderControls({
      brushStrokes: [buildStroke({ isFreeForm: true })],
    });

    expect(
      screen.getByTitle('Switch to rectangle mode (edges move linearly)'),
    ).toBeInTheDocument();
  });
});
