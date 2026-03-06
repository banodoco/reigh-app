/**
 * ImageEditContext Tests
 *
 * Tests for the composed image edit context provider and backward-compatible hook.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import {
  ImageEditProvider,
  useImageEditCanvasSafe,
  useImageEditFormSafe,
  useImageEditStatusSafe,
} from '../ImageEditContext';

describe('ImageEditContext', () => {
  describe('safe hooks outside provider', () => {
    it('useImageEditCanvasSafe returns defaults', () => {
      function Consumer() {
        const canvas = useImageEditCanvasSafe();
        return (
          <div>
            <span data-testid="isInpaintMode">{String(canvas.isInpaintMode)}</span>
            <span data-testid="isMagicEditMode">{String(canvas.isMagicEditMode)}</span>
            <span data-testid="brushSize">{canvas.brushSize}</span>
            <span data-testid="editMode">{String(canvas.editMode)}</span>
          </div>
        );
      }

      render(<Consumer />);

      expect(screen.getByTestId('isInpaintMode')).toHaveTextContent('false');
      expect(screen.getByTestId('isMagicEditMode')).toHaveTextContent('false');
      expect(screen.getByTestId('editMode')).toHaveTextContent('null');
    });

    it('useImageEditFormSafe returns defaults', () => {
      function Consumer() {
        const form = useImageEditFormSafe();
        return (
          <div>
            <span data-testid="inpaintPrompt">{form.inpaintPrompt || 'empty'}</span>
            <span data-testid="img2imgStrength">{form.img2imgStrength}</span>
            <span data-testid="enablePromptExpansion">{String(form.enablePromptExpansion)}</span>
          </div>
        );
      }

      render(<Consumer />);

      expect(screen.getByTestId('inpaintPrompt')).toHaveTextContent('empty');
    });

    it('useImageEditStatusSafe returns defaults', () => {
      function Consumer() {
        const status = useImageEditStatusSafe();
        return (
          <div>
            <span data-testid="isGeneratingInpaint">{String(status.isGeneratingInpaint)}</span>
            <span data-testid="isGeneratingImg2Img">{String(status.isGeneratingImg2Img)}</span>
            <span data-testid="isSavingAsVariant">{String(status.isSavingAsVariant)}</span>
          </div>
        );
      }

      render(<Consumer />);

      expect(screen.getByTestId('isGeneratingInpaint')).toHaveTextContent('false');
      expect(screen.getByTestId('isGeneratingImg2Img')).toHaveTextContent('false');
      expect(screen.getByTestId('isSavingAsVariant')).toHaveTextContent('false');
    });
  });

  describe('ImageEditProvider', () => {
    // Build a minimal mock state for the composed provider
    const mockState = {
      // Canvas state
      isInpaintMode: true,
      isMagicEditMode: false,
      isSpecialEditMode: true,
      editMode: 'inpaint' as const,
      setIsInpaintMode: vi.fn(),
      setIsMagicEditMode: vi.fn(),
      setEditMode: vi.fn(),
      handleEnterInpaintMode: vi.fn(),
      handleExitInpaintMode: vi.fn(),
      handleEnterMagicEditMode: vi.fn(),
      handleExitMagicEditMode: vi.fn(),
      brushSize: 20,
      setBrushSize: vi.fn(),
      isEraseMode: false,
      setIsEraseMode: vi.fn(),
      brushStrokes: [],
      handleUndo: vi.fn(),
      handleClearMask: vi.fn(),
      inpaintPanelPosition: 'right' as const,
      setInpaintPanelPosition: vi.fn(),
      isAnnotateMode: false,
      setIsAnnotateMode: vi.fn(),
      annotationMode: 'rectangle' as const,
      setAnnotationMode: vi.fn(),
      selectedShapeId: null,
      onStrokeComplete: vi.fn(),
      onStrokesChange: vi.fn(),
      onSelectionChange: vi.fn(),
      onTextModeHint: vi.fn(),
      strokeOverlayRef: { current: null },
      getDeleteButtonPosition: vi.fn(),
      handleToggleFreeForm: vi.fn(),
      handleDeleteSelected: vi.fn(),
      repositionTransform: { x: 0, y: 0, scale: 1, rotation: 0, flipH: false, flipV: false },
      hasTransformChanges: false,
      isRepositionDragging: false,
      repositionDragHandlers: {},
      getTransformStyle: vi.fn(),
      setScale: vi.fn(),
      setRotation: vi.fn(),
      toggleFlipH: vi.fn(),
      toggleFlipV: vi.fn(),
      resetTransform: vi.fn(),
      imageContainerRef: { current: null },
      isFlippedHorizontally: false,
      isSaving: false,
      // Form state
      inpaintPrompt: 'a red car',
      setInpaintPrompt: vi.fn(),
      inpaintNumGenerations: 2,
      setInpaintNumGenerations: vi.fn(),
      img2imgPrompt: '',
      setImg2imgPrompt: vi.fn(),
      img2imgStrength: 0.7,
      setImg2imgStrength: vi.fn(),
      enablePromptExpansion: true,
      setEnablePromptExpansion: vi.fn(),
      loraMode: 'none' as const,
      setLoraMode: vi.fn(),
      customLoraUrl: '',
      setCustomLoraUrl: vi.fn(),
      createAsGeneration: false,
      setCreateAsGeneration: vi.fn(),
      qwenEditModel: 'quality' as const,
      setQwenEditModel: vi.fn(),
      advancedSettings: {},
      setAdvancedSettings: vi.fn(),
      // Status state
      isGeneratingInpaint: true,
      inpaintGenerateSuccess: false,
      isGeneratingImg2Img: false,
      img2imgGenerateSuccess: false,
      isGeneratingReposition: false,
      repositionGenerateSuccess: false,
      isSavingAsVariant: false,
      saveAsVariantSuccess: false,
      isCreatingMagicEditTasks: false,
      magicEditTasksCreated: false,
    };

    it('renders children', () => {
      render(
        <ImageEditProvider value={mockState as never}>
          <div data-testid="child">Hello</div>
        </ImageEditProvider>
      );

      expect(screen.getByTestId('child')).toHaveTextContent('Hello');
    });

    it('provides canvas state via sub-context', () => {
      function Consumer() {
        const canvas = useImageEditCanvasSafe();
        return (
          <div>
            <span data-testid="isInpaintMode">{String(canvas.isInpaintMode)}</span>
            <span data-testid="brushSize">{canvas.brushSize}</span>
            <span data-testid="editMode">{canvas.editMode}</span>
          </div>
        );
      }

      render(
        <ImageEditProvider value={mockState as never}>
          <Consumer />
        </ImageEditProvider>
      );

      expect(screen.getByTestId('isInpaintMode')).toHaveTextContent('true');
      expect(screen.getByTestId('brushSize')).toHaveTextContent('20');
      expect(screen.getByTestId('editMode')).toHaveTextContent('inpaint');
    });

    it('provides form state via sub-context', () => {
      function Consumer() {
        const form = useImageEditFormSafe();
        return (
          <div>
            <span data-testid="prompt">{form.inpaintPrompt}</span>
            <span data-testid="numGens">{form.inpaintNumGenerations}</span>
            <span data-testid="img2imgStrength">{form.img2imgStrength}</span>
          </div>
        );
      }

      render(
        <ImageEditProvider value={mockState as never}>
          <Consumer />
        </ImageEditProvider>
      );

      expect(screen.getByTestId('prompt')).toHaveTextContent('a red car');
      expect(screen.getByTestId('numGens')).toHaveTextContent('2');
      expect(screen.getByTestId('img2imgStrength')).toHaveTextContent('0.7');
    });

    it('provides status state via sub-context', () => {
      function Consumer() {
        const status = useImageEditStatusSafe();
        return (
          <div>
            <span data-testid="isGenerating">{String(status.isGeneratingInpaint)}</span>
          </div>
        );
      }

      render(
        <ImageEditProvider value={mockState as never}>
          <Consumer />
        </ImageEditProvider>
      );

      expect(screen.getByTestId('isGenerating')).toHaveTextContent('true');
    });
  });
});
