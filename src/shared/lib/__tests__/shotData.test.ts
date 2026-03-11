import { describe, expect, it } from 'vitest';
import { expandShotData } from '../shots/shotData';

describe('expandShotData', () => {
  it('returns empty list for nullish input', () => {
    expect(expandShotData(null)).toEqual([]);
    expect(expandShotData(undefined)).toEqual([]);
  });

  it('expands arrays to flat shot associations', () => {
    expect(expandShotData({ 'shot-1': [10, 20], 'shot-2': [null] })).toEqual([
      { shot_id: 'shot-1', timeline_frame: 10 },
      { shot_id: 'shot-1', timeline_frame: 20 },
      { shot_id: 'shot-2', timeline_frame: null },
    ]);
  });

  it('supports legacy single-value entries', () => {
    expect(expandShotData({ 'shot-1': 50, 'shot-2': null })).toEqual([
      { shot_id: 'shot-1', timeline_frame: 50 },
      { shot_id: 'shot-2', timeline_frame: null },
    ]);
  });
});
