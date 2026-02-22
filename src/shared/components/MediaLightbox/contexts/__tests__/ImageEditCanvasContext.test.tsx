import { describe, it, expect } from 'vitest';
import { ImageEditCanvasProvider, useImageEditCanvasSafe } from '../ImageEditCanvasContext';

describe('ImageEditCanvasContext', () => {
  it('exports expected members', () => {
    expect(ImageEditCanvasProvider).toBeDefined();
    expect(useImageEditCanvasSafe).toBeDefined();
  });
});
