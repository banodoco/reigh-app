import { describe, it, expect } from 'vitest';
import { ShotImagesEditor } from '../ShotImagesEditor';

describe('ShotImagesEditor', () => {
  it('exports a component', () => {
    expect(ShotImagesEditor).toBeDefined();
    expect(typeof ShotImagesEditor === 'function' || typeof ShotImagesEditor === 'object').toBe(true);
  });
});
