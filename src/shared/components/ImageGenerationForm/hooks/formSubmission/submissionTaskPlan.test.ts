import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildSubmissionTaskParams } from './submissionTaskPlan';

const toastErrorSpy = vi.fn();
const buildBatchTaskParamsSpy = vi.fn();
const buildReferenceParamsSpy = vi.fn();

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorSpy(...args),
  },
}));

vi.mock('../../lib/buildBatchTaskParams', () => ({
  buildBatchTaskParams: (...args: unknown[]) => buildBatchTaskParamsSpy(...args),
}));

vi.mock('./referenceParams', () => ({
  buildReferenceParams: (...args: unknown[]) => buildReferenceParamsSpy(...args),
}));

function baseContext() {
  return {
    selectedProjectId: 'project-1',
    imagesPerPrompt: 2,
    associatedShotId: null,
    beforePromptText: 'before',
    afterPromptText: 'after',
    styleBoostTerms: 'style-boost',
    isLocalGenerationEnabled: true,
    hiresFixConfig: { enabled: true },
    generationSource: 'just-text' as const,
    selectedTextModel: 'qwen-image' as const,
    styleReferenceImageGeneration: null,
    styleReferenceStrength: 0.7,
    subjectStrength: 0.6,
    effectiveSubjectDescription: 'subject',
    inThisScene: false,
    inThisSceneStrength: 0.4,
    referenceMode: 'style' as const,
  };
}

describe('buildSubmissionTaskParams', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildReferenceParamsSpy.mockReturnValue({ ref: 'params' });
    buildBatchTaskParamsSpy.mockReturnValue({ batch: 'task' });
  });

  it('returns null with toast when no valid prompts exist', () => {
    const result = buildSubmissionTaskParams(baseContext(), [
      { id: 'p1', fullPrompt: '   ' },
    ]);

    expect(result).toBeNull();
    expect(toastErrorSpy).toHaveBeenCalledWith('Please enter at least one valid prompt.');
    expect(buildBatchTaskParamsSpy).not.toHaveBeenCalled();
  });

  it('returns null with toast when project is missing', () => {
    const ctx = { ...baseContext(), selectedProjectId: undefined };

    const result = buildSubmissionTaskParams(ctx, [{ id: 'p1', fullPrompt: 'hello' }]);

    expect(result).toBeNull();
    expect(toastErrorSpy).toHaveBeenCalledWith('Please select a project before generating.');
  });

  it('requires style reference for by-reference mode', () => {
    const ctx = {
      ...baseContext(),
      generationSource: 'by-reference' as const,
      styleReferenceImageGeneration: null,
    };

    const result = buildSubmissionTaskParams(ctx, [{ id: 'p1', fullPrompt: 'hello' }]);

    expect(result).toBeNull();
    expect(toastErrorSpy).toHaveBeenCalledWith('Please upload a style reference image for by-reference mode.');
  });

  it('builds canonical task params for valid input', () => {
    const ctx = {
      ...baseContext(),
      generationSource: 'by-reference' as const,
      styleReferenceImageGeneration: 'https://cdn.example.com/style.png',
      referenceMode: 'style' as const,
    };

    const prompts = [
      { id: 'p1', fullPrompt: 'keep this' },
      { id: 'p2', fullPrompt: '   ' },
    ];

    const result = buildSubmissionTaskParams(ctx, prompts, { imagesPerPromptOverride: 3 });

    expect(buildReferenceParamsSpy).toHaveBeenCalledWith('by-reference', expect.objectContaining({
      styleReferenceImageGeneration: 'https://cdn.example.com/style.png',
    }));
    expect(buildBatchTaskParamsSpy).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      prompts: [{ id: 'p1', fullPrompt: 'keep this' }],
      imagesPerPrompt: 3,
      modelName: 'qwen-image',
      styleBoostTerms: 'style-boost',
      referenceParams: { ref: 'params' },
    }));
    expect(result).toEqual({ batch: 'task' });
  });
});
