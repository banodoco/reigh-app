import { describe, expect, it } from 'vitest';
import { buildSubmissionRuntimeContext } from './submissionContext';

describe('buildSubmissionRuntimeContext', () => {
  it('maps runtime submission props and form-state reference into a single context object', () => {
    const formStateRef = { current: undefined };
    const context = buildSubmissionRuntimeContext(
      {
        prompts: [{ id: 'p1', fullPrompt: 'a prompt', shortPrompt: 'short' }],
        promptMultiplier: 2,
        imagesPerPrompt: 3,
        actionablePromptsCount: 1,
        styleReferenceImageGeneration: null,
        generationSourceRef: { current: 'standard' },
        selectedTextModelRef: { current: 'gpt-5-mini' },
      } as never,
      formStateRef as never,
    );

    expect(context.prompts).toHaveLength(1);
    expect(context.promptMultiplier).toBe(2);
    expect(context.imagesPerPrompt).toBe(3);
    expect(context.generationSourceRef.current).toBe('standard');
    expect(context.selectedTextModelRef.current).toBe('gpt-5-mini');
    expect(context.formStateRef).toBe(formStateRef);
  });
});
