import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BatchImageGenerationTaskParams } from '@/shared/types/imageGeneration';

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  resolveTaskCapability: vi.fn(),
}));

vi.mock('./createTask', () => mocks);

import {
  compileImageGenerationParams,
  createImageGenerationTasks,
  IMAGE_GENERATION_CAPABILITY_ID,
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

describe('typed image-generation admission', () => {
  beforeEach(() => {
    mocks.createTask.mockReset();
    mocks.resolveTaskCapability.mockReset();
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
    }));
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
});
