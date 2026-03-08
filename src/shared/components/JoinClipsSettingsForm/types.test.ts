import { describe, expect, it } from 'vitest';
import { resolveJoinClipsSettingsFormProps } from './types';

describe('resolveJoinClipsSettingsFormProps', () => {
  it('flattens clip, motion, and ui prop groups into one resolved object', () => {
    const props = {
      clipSettings: {
        gapFrames: 12,
        setGapFrames: () => {},
        contextFrames: 8,
        setContextFrames: () => {},
        replaceMode: false,
        setReplaceMode: () => {},
        prompt: 'global prompt',
        setPrompt: () => {},
        negativePrompt: 'negative',
        setNegativePrompt: () => {},
      },
      motionConfig: {
        availableLoras: [],
        projectId: 'project-1',
        loraPersistenceKey: 'join-clips',
      },
      uiState: {
        onGenerate: () => {},
        isGenerating: false,
        generateSuccess: false,
        generateButtonText: 'Generate',
      },
    };

    const resolved = resolveJoinClipsSettingsFormProps(props);

    expect(resolved).toEqual(expect.objectContaining({
      gapFrames: 12,
      contextFrames: 8,
      replaceMode: false,
      prompt: 'global prompt',
      negativePrompt: 'negative',
      availableLoras: [],
      projectId: 'project-1',
      loraPersistenceKey: 'join-clips',
      isGenerating: false,
      generateSuccess: false,
      generateButtonText: 'Generate',
    }));
    expect(typeof resolved.setGapFrames).toBe('function');
    expect(typeof resolved.onGenerate).toBe('function');
  });
});
