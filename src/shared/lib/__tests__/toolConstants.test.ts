import { describe, it, expect } from 'vitest';
import { TOOL_IDS } from '../toolIds';
import { TOOL_ROUTES, travelShotUrl } from '../toolRoutes';

describe('TOOL_IDS', () => {
  it('has expected tool IDs', () => {
    expect(TOOL_IDS.TRAVEL_BETWEEN_IMAGES).toBe('travel-between-images');
    expect(TOOL_IDS.IMAGE_GENERATION).toBe('image-generation');
    expect(TOOL_IDS.JOIN_CLIPS).toBe('join-clips');
    expect(TOOL_IDS.EDIT_VIDEO).toBe('edit-video');
    expect(TOOL_IDS.EDIT_IMAGES).toBe('edit-images');
    expect(TOOL_IDS.CHARACTER_ANIMATE).toBe('character-animate');
  });
});

describe('TOOL_ROUTES', () => {
  it('has matching route paths for each tool', () => {
    expect(TOOL_ROUTES.TRAVEL_BETWEEN_IMAGES).toBe('/tools/travel-between-images');
    expect(TOOL_ROUTES.IMAGE_GENERATION).toBe('/tools/image-generation');
    expect(TOOL_ROUTES.JOIN_CLIPS).toBe('/tools/join-clips');
    expect(TOOL_ROUTES.EDIT_VIDEO).toBe('/tools/edit-video');
    expect(TOOL_ROUTES.EDIT_IMAGES).toBe('/tools/edit-images');
    expect(TOOL_ROUTES.CHARACTER_ANIMATE).toBe('/tools/character-animate');
  });
});

describe('travelShotUrl', () => {
  it('builds URL with shot ID as hash', () => {
    expect(travelShotUrl('shot-123')).toBe('/tools/travel-between-images#shot-123');
  });

  it('handles UUID-style shot IDs', () => {
    const uuid = '12345678-1234-1234-1234-123456789abc';
    expect(travelShotUrl(uuid)).toBe(`/tools/travel-between-images#${uuid}`);
  });

  it('handles empty string', () => {
    expect(travelShotUrl('')).toBe('/tools/travel-between-images#');
  });
});
