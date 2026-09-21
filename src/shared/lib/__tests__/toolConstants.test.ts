import { describe, it, expect } from 'vitest';
import { TOOL_IDS } from '../tooling/toolIds';
import {
  astridShotUrl,
  shotListLocation,
  shotLocation,
  TOOL_ROUTES,
  travelShotUrl,
} from '../tooling/toolRoutes';

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

describe('Astrid shot routes', () => {
  it('builds a scoped canonical shot URL', () => {
    expect(astridShotUrl(
      'astrid-intro',
      'timeline-1',
      'project/project-1/document/timeline-1/shot/shot-1/revision/rev-1/occurrence/occ-1',
    )).toBe(
      '/tools/travel-between-images?localProject=astrid-intro&localTimeline=timeline-1#project%2Fproject-1%2Fdocument%2Ftimeline-1%2Fshot%2Fshot-1%2Frevision%2Frev-1%2Foccurrence%2Focc-1',
    );
  });

  it('preserves scope when opening and closing a shot hash', () => {
    expect(shotLocation('/tools/travel-between-images', '?localProject=demo&localTimeline=abc', 'project/demo/shot/1'))
      .toEqual({
        pathname: '/tools/travel-between-images',
        search: '?localProject=demo&localTimeline=abc',
        hash: 'project%2Fdemo%2Fshot%2F1',
      });
    expect(shotListLocation('/tools/travel-between-images', '?localProject=demo&localTimeline=abc'))
      .toEqual({
        pathname: '/tools/travel-between-images',
        search: '?localProject=demo&localTimeline=abc',
        hash: '',
      });
  });
});
