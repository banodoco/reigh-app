import { describe, it, expect } from 'vitest';
import { TopRightControls, BottomLeftControls, BottomRightControls } from '../ButtonGroups';

describe('ButtonGroups', () => {
  it('exports expected members', () => {
    expect(TopRightControls).toBeDefined();
    expect(BottomLeftControls).toBeDefined();
    expect(BottomRightControls).toBeDefined();
  });
});
