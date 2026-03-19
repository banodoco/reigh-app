import { useState, useCallback } from 'react';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { requireSession } from '@/integrations/supabase/auth/ensureAuthenticatedSession';
import { invokeSupabaseEdgeFunction } from '@/integrations/supabase/functions/invokeSupabaseEdgeFunction';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  AIPromptItem,
  GeneratePromptsParams,
  EditPromptParams,
  EditPromptResult,
} from '@/types/ai';

interface UseAIInteractionServiceOptions {
  generatePromptId: () => string; // Function to generate unique IDs for new prompts
}

interface AIInteractionOptions {
  throwOnError?: boolean;
}

async function invokeAuthenticatedAIPrompt<T>(
  body: Record<string, unknown>,
  context: string,
): Promise<T> {
  const session = await requireSession(getSupabaseClient(), context);

  const start = Date.now();
  console.log(`[ai-prompt] ${context} starting, task=${body.task}`);
  const result = await invokeSupabaseEdgeFunction<T>('ai-prompt', {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    timeoutMs: 60000,
  });
  console.log(`[ai-prompt] ${context} completed in ${Date.now() - start}ms`);
  return result;
}

export const useAIInteractionService = ({
  generatePromptId,
}: UseAIInteractionServiceOptions) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const requestSummary = useCallback(
    async (promptText: string): Promise<string | null> => {
      const data = await invokeAuthenticatedAIPrompt<{ summary?: string }>(
        {
          task: 'generate_summary',
          promptText,
        },
        'useAIInteractionService.generateSummary',
      );
      return data?.summary || null;
    },
    [],
  );

  const generateSummary = useCallback(
    async (
      promptText: string,
      options: AIInteractionOptions = {},
    ): Promise<string | null> => {
      setIsSummarizing(true);
      try {
        return await requestSummary(promptText);
      } catch (error) {
        if (options.throwOnError) {
          throw error;
        }
        normalizeAndPresentError(error, {
          context: 'useAIInteractionService.generateSummary',
          showToast: false,
        });
        return null;
      } finally {
        setIsSummarizing(false);
      }
    },
    [requestSummary],
  );

  const generatePrompts = useCallback(
    async (
      params: GeneratePromptsParams,
      options: AIInteractionOptions = {},
    ): Promise<AIPromptItem[]> => {
      setIsGenerating(true);
      try {
      const data = await invokeAuthenticatedAIPrompt<{ prompts?: string[] }>(
        {
          task: 'generate_prompts',
          overallPromptText: params.overallPromptText,
          rulesToRememberText: params.rulesToRememberText,
          numberToGenerate: params.numberToGenerate,
          existingPrompts: params.existingPrompts ?? [],
          temperature: params.temperature || 0.8,
        },
        'useAIInteractionService.generatePrompts',
      );

      const generatedTexts: string[] = data?.prompts ?? [];

      // Generate IDs synchronously so order is deterministic
      const promptsWithIds = generatedTexts.map(text => ({
        id: generatePromptId(),
        text: text.trim(),
      }));

      // Fetch summaries in parallel instead of sequentially
      const summaries = params.addSummaryForNewPrompts
        ? await Promise.all(promptsWithIds.map(p => requestSummary(p.text).catch(() => '')))
        : promptsWithIds.map(() => '');

      return promptsWithIds.map((p, i) => ({
        id: p.id,
        text: p.text,
        shortText: summaries[i] || '',
        hidden: false,
      }));
      } catch (err) {
        if (options.throwOnError) {
          throw err;
        }
        normalizeAndPresentError(err, {
          context: 'useAIInteractionService.generatePrompts',
          showToast: false,
        });
        return [];
      } finally {
        setIsGenerating(false);
      }
    },
    [generatePromptId, requestSummary],
  );

  const editPromptWithAI = useCallback(
    async (
      params: EditPromptParams,
      options: AIInteractionOptions = {},
    ): Promise<EditPromptResult> => {
      setIsEditing(true);
      try {
      const result = await invokeAuthenticatedAIPrompt<{ newText?: string }>(
        {
          task: 'edit_prompt',
          originalPromptText: params.originalPromptText,
          editInstructions: params.editInstructions,
          modelType: params.modelType === 'smart' ? 'smart' : 'fast',
        },
        'useAIInteractionService.editPromptWithAI',
      );

      const newText = result?.newText || params.originalPromptText;
      return { success: true, newText: newText || params.originalPromptText };
      } catch (error) {
        if (options.throwOnError) {
          throw error;
        }
        normalizeAndPresentError(error, {
          context: 'useAIInteractionService.editPromptWithAI',
          showToast: false,
        });
        return { success: false, newText: params.originalPromptText };
      } finally {
        setIsEditing(false);
      }
    },
    [],
  );

  return {
    generatePrompts,
    editPromptWithAI,
    generateSummary,
    isGenerating,
    isEditing,
    isSummarizing,
    isLoading: isGenerating || isEditing || isSummarizing,
  };
};
