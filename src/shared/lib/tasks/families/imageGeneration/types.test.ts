import { describe, expect, expectTypeOf, it } from 'vitest';
import type { PathLoraConfig } from '@/domains/lora/types/lora';
import type {
  BatchImageGenerationTaskParams,
  BuildReferenceParamsInput,
  CalculateTaskResolutionOptions,
  ImageGenerationTaskParams,
  ReferenceApiParams,
  ReferenceMode,
  ReferenceSettingsInput,
} from './types';
import * as imageGenerationTypesModule from './types';

describe('imageGenerationTypes', () => {
  it('loads as a type-only module', () => {
    expect(imageGenerationTypesModule).toBeDefined();
    expect(typeof imageGenerationTypesModule).toBe('object');
    expect(Object.keys(imageGenerationTypesModule)).toEqual([]);
  });

  it('keeps the image generation task contracts aligned', () => {
    expectTypeOf<ReferenceMode>().toEqualTypeOf<
      'style' | 'subject' | 'style-character' | 'scene' | 'custom'
    >();
    expectTypeOf<ReferenceApiParams['reference_mode']>().toEqualTypeOf<ReferenceMode>();
    expectTypeOf<ImageGenerationTaskParams['project_id']>().toEqualTypeOf<string>();
    expectTypeOf<ImageGenerationTaskParams['loras']>().toEqualTypeOf<PathLoraConfig[] | undefined>();
    expectTypeOf<BatchImageGenerationTaskParams['prompts'][number]['fullPrompt']>().toEqualTypeOf<string>();
    expectTypeOf<CalculateTaskResolutionOptions['resolution_mode']>().toEqualTypeOf<
      'project' | 'custom' | undefined
    >();
    expectTypeOf<ReferenceSettingsInput['in_this_scene']>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<BuildReferenceParamsInput['subjectDescription']>().toEqualTypeOf<string | undefined>();
  });
});
