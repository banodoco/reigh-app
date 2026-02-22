import { describe, it, expect } from 'vitest';
import { SingleImagePreview, MultiImagePreview } from '../ImageDragPreview';

describe('ImageDragPreview', () => {
  it('exports expected members', () => {
    expect(SingleImagePreview).toBeDefined();
    expect(MultiImagePreview).toBeDefined();
  });
});
