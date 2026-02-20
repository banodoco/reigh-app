import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STEERABLE_MOTION_SETTINGS,
} from './types';

describe('ShotEditor state types exports', () => {
  it('re-exports default steerable motion settings with expected shape', () => {
    expect(DEFAULT_STEERABLE_MOTION_SETTINGS).toMatchObject({
      negative_prompt: '',
      model_name: expect.any(String),
      seed: expect.any(Number),
      debug: false,
      show_input_images: false,
    });
  });
});
