import { describe, expect, it } from 'vitest';
import type { JoinClipsSettingsFormProps } from './types';

describe('JoinClipsSettingsFormProps', () => {
  it('keeps clip, motion, and ui concerns grouped in the public form contract', () => {
    const props: JoinClipsSettingsFormProps = {
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

    expect(props).toEqual(expect.objectContaining({
      clipSettings: expect.objectContaining({
        gapFrames: 12,
        contextFrames: 8,
        replaceMode: false,
        prompt: 'global prompt',
        negativePrompt: 'negative',
      }),
      motionConfig: expect.objectContaining({
        availableLoras: [],
        projectId: 'project-1',
        loraPersistenceKey: 'join-clips',
      }),
      uiState: expect.objectContaining({
        isGenerating: false,
        generateSuccess: false,
        generateButtonText: 'Generate',
      }),
    }));
    expect(typeof props.clipSettings.setGapFrames).toBe('function');
    expect(typeof props.motionConfig.availableLoras).not.toBe('undefined');
    expect(typeof props.uiState.onGenerate).toBe('function');
    expect(props).not.toEqual(expect.objectContaining({
      availableLoras: [],
      onGenerate: expect.any(Function),
    }));
  });
});
