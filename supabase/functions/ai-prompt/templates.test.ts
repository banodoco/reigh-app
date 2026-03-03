import { describe, expect, it } from 'vitest';
import {
  ENHANCE_SEGMENT_SYSTEM_PROMPT,
  buildEditPromptMessages,
  buildEnhanceSegmentUserPrompt,
  buildGeneratePromptsMessages,
} from './templates.ts';

describe('ai-prompt templates', () => {
  it('builds generate prompts messages with format example when no existing prompts are provided', () => {
    const { systemMsg, userMsg } = buildGeneratePromptsMessages({
      overallPromptText: 'A train entering a station',
      rulesToRememberText: 'Keep it cinematic',
      numberToGenerate: 3,
      existingPrompts: [],
    });

    expect(systemMsg).toContain('generates detailed image prompts');
    expect(userMsg).toContain('Generate exactly 3 distinct image generation prompts');
    expect(userMsg).toContain('FORMAT EXAMPLE (3 prompts)');
    expect(userMsg).toContain('A train entering a station');
  });

  it('builds generate prompts messages with existing prompt context', () => {
    const { userMsg } = buildGeneratePromptsMessages({
      overallPromptText: '',
      rulesToRememberText: '',
      numberToGenerate: 2,
      existingPrompts: [{ text: 'existing one' }, 'existing two'],
    });

    expect(userMsg).toContain('Existing Prompts for Context');
    expect(userMsg).toContain('- existing one');
    expect(userMsg).toContain('- existing two');
  });

  it('builds edit prompt messages with output-only policy', () => {
    const { systemMsg, userMsg } = buildEditPromptMessages({
      originalPromptText: 'A woman walking in a forest',
      editInstructions: 'Make it foggy and dramatic',
    });

    expect(systemMsg).toContain('helps refine user prompts');
    expect(userMsg).toContain('Original Image Prompt: A woman walking in a forest');
    expect(userMsg).toContain('Edit Instructions: Make it foggy and dramatic');
    expect(userMsg).toContain('Output ONLY the revised prompt text');
  });

  it('builds enhancement user prompt and keeps system prompt guidance', () => {
    const userPrompt = buildEnhanceSegmentUserPrompt('camera flies over snowy hills');

    expect(ENHANCE_SEGMENT_SYSTEM_PROMPT).toContain('Output ONLY your three-sentence prompt');
    expect(userPrompt).toContain("The user's input is: 'camera flies over snowy hills'");
    expect(userPrompt).toContain('FINAL REMINDER');
  });
});
