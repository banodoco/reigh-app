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

  return invokeSupabaseEdgeFunction<T>('ai-prompt', {
    body,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    timeoutMs: 20000,
  });
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
      const newPrompts: AIPromptItem[] = [];

      for (const text of generatedTexts) {
        const newId = generatePromptId();
        let shortText = '';
        if (params.addSummaryForNewPrompts) {
          const summary = await requestSummary(text);
          shortText = summary || '';
        }

        newPrompts.push({
          id: newId,
          text: text.trim(),
          shortText,
          hidden: false,
        });
      }

      return newPrompts;
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
