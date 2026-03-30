import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GenerationRow } from '@/domains/generation/types';
import type { BrushStroke } from '../inpainting/types';

const mockUseStrokePersistence = vi.fn();
const mockUseTaskGeneration = vi.fn();

vi.mock('../inpainting/useStrokePersistence', () => ({
  useStrokePersistence: (...args: unknown[]) => mockUseStrokePersistence(...args),
}));

vi.mock('../inpainting/useTaskGeneration', () => ({
  useTaskGeneration: (...args: unknown[]) => mockUseTaskGeneration(...args),
}));

import { useInpainting } from '../useInpainting';

const inpaintStrokes: BrushStroke[] = [
  { id: 'inpaint-1', points: [{ x: 1, y: 2 }], isErasing: false, brushSize: 20 },
];

const annotationStrokes: BrushStroke[] = [
  {
    id: 'annotation-1',
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
    isErasing: false,
    brushSize: 12,
    shapeType: 'rectangle',
  },
];

const baseMedia = {
  id: 'gen-1',
  project_id: 'proj-1',
  user_id: 'user-1',
  prompt: 'test prompt',
  image_url: 'https://example.com/image.png',
  created_at: '2026-03-30T00:00:00.000Z',
  updated_at: '2026-03-30T00:00:00.000Z',
} as GenerationRow;

describe('useInpainting', () => {
  beforeEach(() => {
    mockUseStrokePersistence.mockReset();
    mockUseTaskGeneration.mockReset();

    mockUseStrokePersistence.mockReturnValue({
      inpaintStrokes,
      annotationStrokes,
      brushSize: 24,
      setInpaintStrokes: vi.fn(),
      setAnnotationStrokes: vi.fn(),
      setBrushSize: vi.fn(),
    });

    mockUseTaskGeneration.mockReturnValue({
      handleGenerateInpaint: vi.fn(),
      handleGenerateAnnotatedEdit: vi.fn(),
    });
  });

  it('uses incoming edit settings props and forwards them to task generation', () => {
    const setEditMode = vi.fn();
    const setAnnotationMode = vi.fn();
    const setInpaintPrompt = vi.fn();
    const setInpaintNumGenerations = vi.fn();

    const { result } = renderHook(() =>
      useInpainting({
        media: baseMedia,
        selectedProjectId: 'proj-1',
        shotId: 'shot-1',
        isVideo: false,
        imageDimensions: null,
        imageContainerRef: { current: null },
        handleExitInpaintMode: vi.fn(),
        editMode: 'annotate',
        annotationMode: 'rectangle',
        inpaintPrompt: 'keep the skyline',
        inpaintNumGenerations: 3,
        setEditMode,
        setAnnotationMode,
        setInpaintPrompt,
        setInpaintNumGenerations,
      }),
    );

    expect(result.current.editMode).toBe('annotate');
    expect(result.current.annotationMode).toBe('rectangle');
    expect(result.current.inpaintPrompt).toBe('keep the skyline');
    expect(result.current.inpaintNumGenerations).toBe(3);
    expect(result.current.brushStrokes).toEqual(annotationStrokes);

    expect(mockUseTaskGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        inpaintStrokes,
        annotationStrokes,
        inpaintPrompt: 'keep the skyline',
        inpaintNumGenerations: 3,
      }),
    );
  });

  it('delegates edit-setting setters to incoming prop callbacks', () => {
    const setEditMode = vi.fn();
    const setAnnotationMode = vi.fn();
    const setInpaintPrompt = vi.fn();
    const setInpaintNumGenerations = vi.fn();

    const { result } = renderHook(() =>
      useInpainting({
        media: baseMedia,
        selectedProjectId: 'proj-1',
        isVideo: false,
        imageDimensions: null,
        imageContainerRef: { current: null },
        handleExitInpaintMode: vi.fn(),
        editMode: 'text',
        annotationMode: null,
        inpaintPrompt: '',
        inpaintNumGenerations: 1,
        setEditMode,
        setAnnotationMode,
        setInpaintPrompt,
        setInpaintNumGenerations,
      }),
    );

    act(() => {
      result.current.setEditMode('inpaint');
      result.current.setAnnotationMode('rectangle');
      result.current.setInpaintPrompt('new prompt');
      result.current.setInpaintNumGenerations(5);
    });

    expect(setEditMode).toHaveBeenCalledWith('inpaint');
    expect(setAnnotationMode).toHaveBeenCalledWith('rectangle');
    expect(setInpaintPrompt).toHaveBeenCalledWith('new prompt');
    expect(setInpaintNumGenerations).toHaveBeenCalledWith(5);
  });
});
