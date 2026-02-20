import { describe, expect, it } from 'vitest';
import * as VideoPortionEditorIndex from './index';

describe('VideoPortionEditor index direct coverage', () => {
  it('exports index module directly', () => {
    expect(VideoPortionEditorIndex).toBeDefined();
  });
});
