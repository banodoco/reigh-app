import { describe, it, expect } from 'vitest';
import { EditorHeader, EditorContent, EditorOverlays } from '../ShotImagesEditorSections';

describe('ShotImagesEditorSections', () => {
  it('exports expected members', () => {
    expect(EditorHeader).toBeDefined();
    expect(EditorContent).toBeDefined();
    expect(EditorOverlays).toBeDefined();
  });
});
