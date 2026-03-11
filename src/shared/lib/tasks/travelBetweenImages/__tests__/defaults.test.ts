import { describe, it, expect } from 'vitest';
import {
  DEFAULT_STRUCTURE_VIDEO,
  DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES,
} from '../defaults';

describe('DEFAULT_STRUCTURE_VIDEO', () => {
  it('has correct default treatment', () => {
    expect(DEFAULT_STRUCTURE_VIDEO.treatment).toBe('adjust');
  });

  it('has correct default motion strength', () => {
    expect(DEFAULT_STRUCTURE_VIDEO.motion_strength).toBe(1.2);
  });

  it('has uni3c as default video type', () => {
    expect(DEFAULT_STRUCTURE_VIDEO.structure_type).toBe('uni3c');
  });

  it('has all required keys', () => {
    expect(DEFAULT_STRUCTURE_VIDEO).toHaveProperty('treatment');
    expect(DEFAULT_STRUCTURE_VIDEO).toHaveProperty('motion_strength');
    expect(DEFAULT_STRUCTURE_VIDEO).toHaveProperty('structure_type');
  });
});

describe('DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES', () => {
  it('has correct default model name', () => {
    expect(DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.model_name).toBe('wan_2_2_i2v_lightning_baseline_2_2_2');
  });

  it('has correct default seed', () => {
    expect(DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.seed).toBe(789);
  });

  it('has correct default steps', () => {
    expect(DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.steps).toBe(20);
  });

  it('has correct default amount_of_motion', () => {
    expect(DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.amount_of_motion).toBe(0.5);
  });

  it('has generation_mode set to batch', () => {
    expect(DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.generation_mode).toBe('batch');
  });

  it('has dimension_source set to project', () => {
    expect(DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.dimension_source).toBe('project');
  });

  it('defaults enhance_prompt to false', () => {
    expect(DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.enhance_prompt).toBe(false);
  });

  it('defaults show_input_images to false', () => {
    expect(DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.show_input_images).toBe(false);
  });

  it('defaults debug to false for production payload safety', () => {
    expect(DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.debug).toBe(false);
  });
});
