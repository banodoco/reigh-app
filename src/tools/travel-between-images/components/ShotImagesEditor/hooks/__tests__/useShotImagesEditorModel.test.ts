import { describe, it, expect } from 'vitest';
import { useShotImagesEditorModel } from '../useShotImagesEditorModel';

describe('useShotImagesEditorModel', () => {
  it('exports expected members', () => {
    expect(useShotImagesEditorModel).toBeDefined();
  });

  it('useShotImagesEditorModel is a callable function', () => {
    expect(typeof useShotImagesEditorModel).toBe('function');
    expect(useShotImagesEditorModel.name).toBeDefined();
  });
});
