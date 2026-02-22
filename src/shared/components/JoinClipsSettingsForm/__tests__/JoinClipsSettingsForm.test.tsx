import { describe, it, expect } from 'vitest';
import { DEFAULT_JOIN_CLIPS_PHASE_CONFIG, BUILTIN_JOIN_CLIPS_DEFAULT_ID, JoinClipsSettingsForm } from '../JoinClipsSettingsForm';

describe('JoinClipsSettingsForm', () => {
  it('exports expected members', () => {
    expect(DEFAULT_JOIN_CLIPS_PHASE_CONFIG).toBeDefined();
    expect(BUILTIN_JOIN_CLIPS_DEFAULT_ID).toBeDefined();
    expect(JoinClipsSettingsForm).toBeDefined();
  });
});
