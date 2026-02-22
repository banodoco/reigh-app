import { describe, it, expect } from 'vitest';
import { extractSettingsFromParams, buildMetadataUpdate } from '../segmentSettingsMigration';

describe('segmentSettingsMigration', () => {
  it('exports expected members', () => {
    expect(extractSettingsFromParams).toBeDefined();
    expect(buildMetadataUpdate).toBeDefined();
  });
});
