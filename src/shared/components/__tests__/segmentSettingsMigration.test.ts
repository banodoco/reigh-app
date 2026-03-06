import { describe, it, expect } from 'vitest';
import { extractSettingsFromParams, buildMetadataUpdate } from '../SegmentSettingsForm/segmentSettingsMigration';

describe('segmentSettingsMigration', () => {
  it('exports expected members', () => {
    expect(extractSettingsFromParams).toBeDefined();
    expect(buildMetadataUpdate).toBeDefined();
  });

  it('normalizes top-level loras[] as canonical input', () => {
    const settings = extractSettingsFromParams({
      loras: [{ path: 'https://example.com/a.safetensors', strength: 0.7 }],
    });

    expect(settings.loras).toEqual([
      {
        id: 'https://example.com/a.safetensors',
        name: 'a',
        path: 'https://example.com/a.safetensors',
        strength: 0.7,
      },
    ]);
  });

  it('normalizes top-level additional_loras object into loras[]', () => {
    const settings = extractSettingsFromParams({
      additional_loras: { 'https://example.com/b.safetensors': 0.55 },
    });

    expect(settings.loras).toEqual([
      {
        id: 'https://example.com/b.safetensors',
        name: 'b',
        path: 'https://example.com/b.safetensors',
        strength: 0.55,
      },
    ]);
  });

  it('normalizes orchestrator_details additional_loras when top-level is absent', () => {
    const settings = extractSettingsFromParams({
      orchestrator_details: {
        additional_loras: { 'https://example.com/c.safetensors': 1.0 },
      },
    });

    expect(settings.loras).toEqual([
      {
        id: 'https://example.com/c.safetensors',
        name: 'c',
        path: 'https://example.com/c.safetensors',
        strength: 1.0,
      },
    ]);
  });

  it('falls back to defaults when params contain no lora data', () => {
    const defaults = {
      loras: [
        {
          id: 'default-id',
          name: 'default-name',
          path: 'https://example.com/default.safetensors',
          strength: 0.8,
        },
      ],
    };

    const settings = extractSettingsFromParams({}, defaults);
    expect(settings.loras).toEqual(defaults.loras);
  });
});
