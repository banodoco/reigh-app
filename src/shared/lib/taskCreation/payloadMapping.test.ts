import { describe, it, expect } from 'vitest';
import { mapDefinedPayloadFields, assignMappedPayloadFields } from './payloadMapping';

describe('payloadMapping', () => {
  it('maps fields with optional rename, transform, and include guards', () => {
    const source = {
      width: 1280,
      height: 720,
      prompt: 'A scene',
      negativePrompt: '',
      optional: undefined as string | undefined,
    };

    const mapped = mapDefinedPayloadFields(source, [
      { from: 'width' },
      { from: 'height', to: 'h' },
      { from: 'prompt', transform: (value) => String(value).toUpperCase() },
      { from: 'negativePrompt', include: (value) => String(value).length > 0 },
      { from: 'optional' },
    ] as const);

    expect(mapped).toEqual({
      width: 1280,
      h: 720,
      prompt: 'A SCENE',
    });
  });

  it('assigns mapped fields into an existing target object', () => {
    const target: Record<string, unknown> = { existing: 'keep' };
    const source = { model: 'qwen-image', seed: 42 };

    assignMappedPayloadFields(target, source, [
      { from: 'model', to: 'text_model' },
      { from: 'seed' },
    ] as const);

    expect(target).toEqual({
      existing: 'keep',
      text_model: 'qwen-image',
      seed: 42,
    });
  });
});
