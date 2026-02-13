import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/shared/lib/invokeWithTimeout', () => ({
  invokeWithTimeout: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { useAIInteractionService } from '../useAIInteractionService';
import { invokeWithTimeout } from '@/shared/lib/invokeWithTimeout';

describe('useAIInteractionService', () => {
  const mockGeneratePromptId = vi.fn(() => 'new-id');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all expected functions and state', () => {
    const { result } = renderHook(() =>
      useAIInteractionService({ generatePromptId: mockGeneratePromptId })
    );
    expect(typeof result.current.generatePrompts).toBe('function');
    expect(typeof result.current.editPromptWithAI).toBe('function');
    expect(typeof result.current.generateSummary).toBe('function');
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.isEditing).toBe(false);
    expect(result.current.isSummarizing).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('generates prompts via edge function', async () => {
    vi.mocked(invokeWithTimeout).mockResolvedValue({ prompts: ['prompt 1', 'prompt 2'] });

    const { result } = renderHook(() =>
      useAIInteractionService({ generatePromptId: mockGeneratePromptId })
    );

    let prompts: unknown[];
    await act(async () => {
      prompts = await result.current.generatePrompts({
        overallPromptText: 'test',
        numberToGenerate: 2,
      });
    });

    expect(prompts!).toHaveLength(2);
    expect(prompts![0]).toHaveProperty('text', 'prompt 1');
  });

  it('handles generate prompts error', async () => {
    vi.mocked(invokeWithTimeout).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() =>
      useAIInteractionService({ generatePromptId: mockGeneratePromptId })
    );

    let prompts: unknown[];
    await act(async () => {
      prompts = await result.current.generatePrompts({
        overallPromptText: 'test',
        numberToGenerate: 1,
      });
    });

    expect(prompts!).toEqual([]);
  });

  it('edits prompt with AI', async () => {
    vi.mocked(invokeWithTimeout).mockResolvedValue({ newText: 'edited prompt' });

    const { result } = renderHook(() =>
      useAIInteractionService({ generatePromptId: mockGeneratePromptId })
    );

    let editResult: { success: boolean; newText: string };
    await act(async () => {
      editResult = await result.current.editPromptWithAI({
        originalPromptText: 'original',
        editInstructions: 'make shorter',
      });
    });

    expect(editResult!.success).toBe(true);
    expect(editResult!.newText).toBe('edited prompt');
  });

  it('returns original text on edit error', async () => {
    vi.mocked(invokeWithTimeout).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() =>
      useAIInteractionService({ generatePromptId: mockGeneratePromptId })
    );

    let editResult: { success: boolean; newText: string };
    await act(async () => {
      editResult = await result.current.editPromptWithAI({
        originalPromptText: 'original text',
        editInstructions: 'test',
      });
    });

    expect(editResult!.success).toBe(false);
    expect(editResult!.newText).toBe('original text');
  });

  it('generates summary', async () => {
    vi.mocked(invokeWithTimeout).mockResolvedValue({ summary: 'short summary' });

    const { result } = renderHook(() =>
      useAIInteractionService({ generatePromptId: mockGeneratePromptId })
    );

    let summary: string | null;
    await act(async () => {
      summary = await result.current.generateSummary('long prompt text');
    });

    expect(summary!).toBe('short summary');
  });
});
