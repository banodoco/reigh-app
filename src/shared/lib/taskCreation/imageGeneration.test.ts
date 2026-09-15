import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchImageGenerationTaskParams } from '@/shared/types/imageGeneration';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  ingestProjectInputFromUrl: vi.fn(),
  resolveTaskCapability: vi.fn(),
}));

vi.mock('./createTask', () => mocks);

import {
  compileImageGenerationParams,
  createImageGenerationTasks,
  createImageToImageTask,
  IMAGE_GENERATION_CAPABILITY_ID,
  IMAGE_I2I_CAPABILITY_ID,
} from './imageGeneration';

function params(overrides: Partial<BatchImageGenerationTaskParams> = {}): BatchImageGenerationTaskParams {
  return {
    project_id: 'project-1',
    prompts: [{ id: 'p-1', fullPrompt: 'a lighthouse at dawn' }, { id: 'p-2', fullPrompt: 'a lighthouse at dusk' }],
    imagesPerPrompt: 2,
    model_name: 'z-image',
    execution: 'cloud',
    resolution: '1536x1024',
    ...overrides,
  };
}

function composedImageRequest(overrides: Record<string, unknown> = {}) {
  const digest = `sha256:${'a'.repeat(64)}`;
  return {
    project: 'project-1',
    capability_id: IMAGE_GENERATION_CAPABILITY_ID,
    capability_digest: digest,
    schema_version: '1',
    input_object_ids: [],
    spec: {
      family: IMAGE_GENERATION_CAPABILITY_ID,
      params: {
        model: 'z-image',
        mode: 't2i',
        execution: 'cloud',
        prompt: 'one',
        count: 2,
        size: '1536x1024',
      },
      output_policy: {},
    },
    storage_estimate: { scratch_bytes: 8 * 1024 * 1024 * 1024, output_bytes: 128 * 1024 * 1024 },
    generation_intent: {
      version: 1,
      modality: 'image',
      partial_success_policy: 'reject',
      groups: [{
        group_key: 'main',
        selectors: [
          { selector: 'main-0', ordinal: 0, variant_key: 'original' },
          { selector: 'main-1', ordinal: 1, variant_key: 'variant-1' },
        ],
      }],
    },
    settlement_effect: {
      effect_type: 'generation.publish_v1',
      target_id: 'project-1',
      payload: {
        version: 1,
        modality: 'image',
        generation_type: IMAGE_GENERATION_CAPABILITY_ID,
        metadata: {},
        partial_success_policy: 'reject',
        groups: [{
          group_key: 'main',
          selectors: [
            { selector: 'main-0', ordinal: 0, variant_key: 'original', output_port: 'generated_images' },
            { selector: 'main-1', ordinal: 1, variant_key: 'variant-1', output_port: 'generated_images' },
          ],
        }],
      },
    },
    ...overrides,
  };
}

describe('typed image-generation admission', () => {
  beforeEach(() => {
    mocks.createTask.mockReset();
    mocks.ingestProjectInputFromUrl.mockReset();
    mocks.resolveTaskCapability.mockReset();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(composedImageRequest()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
  });

  it('rejects multi-prompt fan-out until admission is atomic', () => {
    expect(() => compileImageGenerationParams(params({ seed: 42 }))).toThrow('one prompt per task');
  });

  it('fails closed for unregistered model identities and reference URLs', () => {
    expect(() => compileImageGenerationParams(params({ model_name: 'qwen-image' }))).toThrow('not registered');
    expect(() => compileImageGenerationParams(params({ execution: 'local' }))).toThrow('cloud execution only');
    expect(() => compileImageGenerationParams(params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
      subject_reference_image: 'https://example.test/ref.png',
    })))
      .toThrow('reference media');
  });

  it('binds the live digest and uses nonzero catalog estimates per admitted task', async () => {
    mocks.resolveTaskCapability.mockResolvedValue({
      capability_id: IMAGE_GENERATION_CAPABILITY_ID,
      definition_digest: `sha256:${'a'.repeat(64)}`,
      status: 'ready',
      required_resource_keys: ['gpu'],
      estimated_scratch_bytes: 8 * 1024 * 1024 * 1024,
      estimated_output_bytes: 64 * 1024 * 1024,
    });
    mocks.createTask
      .mockResolvedValueOnce({ task_id: 'task-1', status: 'Queued' })
      .mockResolvedValueOnce({ task_id: 'task-2', status: 'Queued' });

    await expect(createImageGenerationTasks('project-1', params({ prompts: [{ id: 'p-1', fullPrompt: 'one' }] })))
      .resolves.toMatchObject({ task_ids: ['task-1'] });
    expect(mocks.resolveTaskCapability).toHaveBeenCalledWith('project-1', IMAGE_GENERATION_CAPABILITY_ID);
    expect(mocks.createTask).toHaveBeenCalledWith(expect.objectContaining({
      project: 'project-1',
      capability_id: IMAGE_GENERATION_CAPABILITY_ID,
      capability_digest: `sha256:${'a'.repeat(64)}`,
      input_object_ids: [],
      storage_estimate: {
        scratch_bytes: 8 * 1024 * 1024 * 1024,
        output_bytes: 128 * 1024 * 1024,
      },
      spec: expect.objectContaining({
        family: IMAGE_GENERATION_CAPABILITY_ID,
        params: expect.objectContaining({ prompt: 'one', count: 2, mode: 't2i' }),
      }),
      generation_intent: expect.objectContaining({ modality: 'image' }),
      settlement_effect: expect.objectContaining({ effect_type: 'generation.publish_v1' }),
    }));
    expect(fetch).toHaveBeenCalledWith('/api/astrid/generation/compose', expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
    }));
  });

  it('refuses an unavailable or malformed composer before any Runtime admission', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('helper unavailable')));
    mocks.resolveTaskCapability.mockResolvedValue({
      capability_id: IMAGE_GENERATION_CAPABILITY_ID,
      definition_digest: `sha256:${'a'.repeat(64)}`,
      status: 'ready',
      required_resource_keys: [],
      estimated_scratch_bytes: 1,
      estimated_output_bytes: 1,
    });

    await expect(createImageGenerationTasks('project-1', params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
    }))).rejects.toThrow('composer is unavailable');
    expect(mocks.createTask).not.toHaveBeenCalled();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ nope: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })));
    await expect(createImageGenerationTasks('project-1', params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
    }))).rejects.toThrow('invalid HC-04 request');
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('blocks admission when the registered capability has no storage estimate', async () => {
    mocks.resolveTaskCapability.mockResolvedValue({
      capability_id: IMAGE_GENERATION_CAPABILITY_ID,
      definition_digest: `sha256:${'a'.repeat(64)}`,
      status: 'ready',
      required_resource_keys: [],
      estimated_scratch_bytes: 0,
      estimated_output_bytes: 0,
    });
    await expect(createImageGenerationTasks('project-1', params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
    }))).rejects.toThrow('nonzero storage estimate');
    expect(mocks.createTask).not.toHaveBeenCalled();
  });

  it('maps the canonical UI resolution into the executor size port', () => {
    expect(compileImageGenerationParams(params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
      resolution: '1536x1024',
    }))).toEqual([expect.objectContaining({ size: '1536x1024' })]);
  });

  it('rejects malformed canonical resolutions instead of guessing dimensions', () => {
    expect(() => compileImageGenerationParams(params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
      resolution: 'landscape',
    }))).toThrow('positive WIDTHxHEIGHT');
  });

  it('rejects missing authoritative dimensions instead of accepting provider defaults', () => {
    const { resolution: _resolution, ...withoutResolution } = params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
    });
    expect(() => compileImageGenerationParams(withoutResolution)).toThrow('authoritative image resolution');
  });

  it('rejects unsupported semantics instead of silently dropping them', () => {
    expect(() => compileImageGenerationParams(params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
      shot_id: 'shot-1',
    }))).toThrow('shot lineage');
    expect(() => compileImageGenerationParams(params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
      negative_prompt: 'blurry',
    }))).toThrow('negative prompts');
  });

  it('bounds scalar integers and image dimensions before admission', () => {
    expect(() => compileImageGenerationParams(params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
      imagesPerPrompt: 17,
    }))).toThrow('imagesPerPrompt');
    expect(() => compileImageGenerationParams(params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
      seed: -1,
    }))).toThrow('seed');
    expect(() => compileImageGenerationParams(params({
      prompts: [{ id: 'p-1', fullPrompt: 'one' }],
      resolution: '20000x1024',
    }))).toThrow('positive WIDTHxHEIGHT');
  });

  it('admits i2i with ordered CAS source custody and typed controls', async () => {
    const sourceObjectId = `sha256:${'b'.repeat(64)}`;
    mocks.resolveTaskCapability.mockResolvedValue({
      capability_id: IMAGE_I2I_CAPABILITY_ID,
      definition_digest: `sha256:${'a'.repeat(64)}`,
      status: 'ready',
      required_resource_keys: ['gpu'],
      estimated_scratch_bytes: 8 * 1024 * 1024,
      estimated_output_bytes: 64 * 1024,
    });
    mocks.ingestProjectInputFromUrl.mockResolvedValue({
      object_id: sourceObjectId,
      media_type: 'image/jpeg',
      size: 1234,
      filename: 'source.jpg',
      receipt: {},
    });
    mocks.createTask.mockResolvedValue({ task_id: 'task-i2i', status: 'Queued' });

    await expect(createImageToImageTask('project-1', {
      sourceUrl: 'https://media.example/source.jpg',
      prompt: 'make it cinematic',
      strength: 0.6,
      count: 1,
    })).resolves.toMatchObject({ task_id: 'task-i2i' });

    expect(mocks.ingestProjectInputFromUrl).toHaveBeenCalledWith(
      'project-1',
      'https://media.example/source.jpg',
      { maxBytes: 512_000, requireImage: true },
    );
    expect(mocks.createTask).toHaveBeenCalledWith({
      project: 'project-1',
      capability_id: IMAGE_I2I_CAPABILITY_ID,
      capability_digest: `sha256:${'a'.repeat(64)}`,
      schema_version: '1',
      input_object_ids: [sourceObjectId],
      spec: {
        family: IMAGE_I2I_CAPABILITY_ID,
        params: {
          model: 'z-image',
          mode: 'i2i',
          execution: 'cloud',
          prompt: 'make it cinematic',
          count: 1,
          size: '1024x1024',
          strength: 0.6,
          image_ref: {
            digest: sourceObjectId,
            filename: 'source.jpg',
            media_type: 'image/jpeg',
          },
        },
        output_policy: {},
      },
      storage_estimate: {
        scratch_bytes: 8 * 1024 * 1024,
        output_bytes: 64 * 1024,
      },
      settlement_effect: {},
    });
    const admission = mocks.createTask.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(JSON.stringify(admission)).not.toContain('media.example');
  });

  it('rejects i2i controls that cannot be represented by the typed route', async () => {
    await expect(createImageToImageTask('project-1', {
      sourceUrl: 'https://media.example/source.png',
      prompt: 'one',
      strength: 0.5,
      count: 2,
    })).rejects.toThrow('exactly one output');
    await expect(createImageToImageTask('project-1', {
      sourceUrl: 'https://media.example/source.png',
      prompt: 'one',
      strength: 0.5,
      count: 1,
      loraCount: 1,
    })).rejects.toThrow('LoRA controls');
    await expect(createImageToImageTask('project-1', {
      sourceUrl: 'https://media.example/source.png',
      prompt: 'one',
      strength: 0.5,
      count: 1,
      enablePromptExpansion: true,
    })).rejects.toThrow('Prompt expansion');
    await expect(createImageToImageTask('project-1', {
      sourceUrl: 'https://media.example/source.png',
      prompt: 'one',
      strength: 0.5,
      count: 1,
      basedOn: 'generation-1',
    })).rejects.toThrow('atomic generation/variant lineage effect');
    expect(mocks.resolveTaskCapability).not.toHaveBeenCalled();
  });

  it('rejects non-image sources and oversized sources before admission', async () => {
    mocks.resolveTaskCapability.mockResolvedValue({
      capability_id: IMAGE_GENERATION_CAPABILITY_ID,
      definition_digest: `sha256:${'a'.repeat(64)}`,
      status: 'ready',
      required_resource_keys: [],
      estimated_scratch_bytes: 1,
      estimated_output_bytes: 1,
    });
    mocks.ingestProjectInputFromUrl.mockResolvedValueOnce({
      object_id: `sha256:${'c'.repeat(64)}`,
      media_type: 'video/mp4',
      size: 100,
      filename: 'source.mp4',
      receipt: {},
    }).mockResolvedValueOnce({
      object_id: `sha256:${'d'.repeat(64)}`,
      media_type: 'image/png',
      size: 512_001,
      filename: 'source.png',
      receipt: {},
    });
    const request = {
      sourceUrl: 'https://media.example/source',
      prompt: 'one',
      strength: 0.5,
      count: 1,
    } as const;
    await expect(createImageToImageTask('project-1', request)).rejects.toThrow('must be an image');
    await expect(createImageToImageTask('project-1', request)).rejects.toThrow('upload boundary');
    expect(mocks.createTask).not.toHaveBeenCalled();
  });
});
