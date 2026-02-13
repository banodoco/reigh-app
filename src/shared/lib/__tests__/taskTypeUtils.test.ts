import { describe, it, expect } from 'vitest';
import { isJoinClipsTaskType, isTravelTaskType, isCharacterAnimateTaskType } from '../taskTypeUtils';

describe('isJoinClipsTaskType', () => {
  it('returns true for join clips types', () => {
    expect(isJoinClipsTaskType('join_clips_orchestrator')).toBe(true);
    expect(isJoinClipsTaskType('join_clips_segment')).toBe(true);
    expect(isJoinClipsTaskType('join_clips')).toBe(true);
    expect(isJoinClipsTaskType('clip_join')).toBe(true); // variant_type
  });

  it('returns false for non-join types', () => {
    expect(isJoinClipsTaskType('travel_orchestrator')).toBe(false);
    expect(isJoinClipsTaskType('image_gen')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isJoinClipsTaskType(null)).toBe(false);
    expect(isJoinClipsTaskType(undefined)).toBe(false);
  });
});

describe('isTravelTaskType', () => {
  it('returns true for travel types', () => {
    expect(isTravelTaskType('travel_orchestrator')).toBe(true);
    expect(isTravelTaskType('travel_segment')).toBe(true);
    expect(isTravelTaskType('individual_travel_segment')).toBe(true);
  });

  it('returns true for partial travel match', () => {
    expect(isTravelTaskType('custom_travel_task')).toBe(true);
  });

  it('returns false for non-travel types', () => {
    expect(isTravelTaskType('join_clips')).toBe(false);
    expect(isTravelTaskType('image_gen')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isTravelTaskType(null)).toBe(false);
    expect(isTravelTaskType(undefined)).toBe(false);
  });
});

describe('isCharacterAnimateTaskType', () => {
  it('returns true for animate_character', () => {
    expect(isCharacterAnimateTaskType('animate_character')).toBe(true);
  });

  it('returns false for other types', () => {
    expect(isCharacterAnimateTaskType('travel_segment')).toBe(false);
    expect(isCharacterAnimateTaskType('image_gen')).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isCharacterAnimateTaskType(null)).toBe(false);
    expect(isCharacterAnimateTaskType(undefined)).toBe(false);
  });
});
