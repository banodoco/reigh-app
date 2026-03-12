import { describe, expect, it } from 'vitest';
import { TaskValidationError } from '../../../taskCreation';
import {
  validateBatchImageGenerationParams,
  validateImageGenerationParams,
} from './validators';

describe('imageGenerationValidators', () => {
  it('accepts valid single-image generation params', () => {
    expect(() => validateImageGenerationParams({
      project_id: 'project-1',
      prompt: 'A cinematic portrait',
      seed: 1234,
      loras: [{ path: 'portrait.safetensors', strength: 0.8 }],
    })).not.toThrow();
  });

  it('rejects blank prompts and preserves the prompt field in the validation error', () => {
    let thrown: unknown;

    try {
      validateImageGenerationParams({
        project_id: 'project-1',
        prompt: '   ',
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TaskValidationError);
    expect((thrown as TaskValidationError).field).toBe('prompt');
    expect((thrown as TaskValidationError).message).toBe('prompt cannot be empty');
  });

  it('rewrites out-of-range lora strength errors to the user-facing wording', () => {
    let thrown: unknown;

    try {
      validateImageGenerationParams({
        project_id: 'project-1',
        prompt: 'A cinematic portrait',
        loras: [{ path: 'portrait.safetensors', strength: 2.5 }],
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TaskValidationError);
    expect((thrown as TaskValidationError).field).toBe('loras[0].strength');
    expect((thrown as TaskValidationError).message).toBe(
      'LoRA 1: strength must be a number between 0 and 2',
    );
  });

  it('rejects empty prompt batches and invalid per-prompt entries', () => {
    expect(() => validateBatchImageGenerationParams({
      project_id: 'project-1',
      prompts: [],
      imagesPerPrompt: 1,
    })).toThrowError(new TaskValidationError('prompts cannot be empty', 'prompts'));

    let thrown: unknown;

    try {
      validateBatchImageGenerationParams({
        project_id: 'project-1',
        prompts: [{ id: 'prompt-1', fullPrompt: '   ' }],
        imagesPerPrompt: 1,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TaskValidationError);
    expect((thrown as TaskValidationError).field).toBe('prompts[0].fullPrompt');
    expect((thrown as TaskValidationError).message).toBe('Prompt 1: fullPrompt cannot be empty');
  });

  it('rejects imagesPerPrompt values outside the supported range', () => {
    let thrown: unknown;

    try {
      validateBatchImageGenerationParams({
        project_id: 'project-1',
        prompts: [{ id: 'prompt-1', fullPrompt: 'A cinematic portrait' }],
        imagesPerPrompt: 17,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(TaskValidationError);
    expect((thrown as TaskValidationError).field).toBe('imagesPerPrompt');
    expect((thrown as TaskValidationError).message).toBe('Images per prompt must be between 1 and 16');
  });
});
