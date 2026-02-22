import { describe, it, expect } from 'vitest';
import { videoItemPropsAreEqual } from '../VideoItemMemo';

describe('VideoItemMemo', () => {
  it('exports expected members', () => {
    expect(videoItemPropsAreEqual).toBeDefined();
  });
});
