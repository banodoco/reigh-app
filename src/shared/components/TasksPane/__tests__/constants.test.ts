import { describe, it, expect } from 'vitest';
import { ITEMS_PER_PAGE, STATUS_GROUPS, KNOWN_IMAGE_TASK_TYPES, IMAGE_EDIT_TASK_TYPES, TASK_NAME_ABBREVIATIONS } from '../constants';

describe('constants', () => {
  it('exports expected members', () => {
    expect(ITEMS_PER_PAGE).toBeDefined();
    expect(STATUS_GROUPS).toBeDefined();
    expect(KNOWN_IMAGE_TASK_TYPES).toBeDefined();
    expect(IMAGE_EDIT_TASK_TYPES).toBeDefined();
    expect(TASK_NAME_ABBREVIATIONS).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(ITEMS_PER_PAGE).not.toBeNull();
    expect(STATUS_GROUPS).not.toBeNull();
    expect(KNOWN_IMAGE_TASK_TYPES).not.toBeNull();
  });
});
