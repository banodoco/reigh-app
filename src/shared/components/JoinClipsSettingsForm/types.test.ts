import { describe, expect, it, vi } from 'vitest';
import { resolveJoinClipsSettingsFormProps, type JoinClipsSettingsFormProps } from './types';

function buildProps(): JoinClipsSettingsFormProps {
  return {
    clipSettings: {
      gapFrames: 8,
      setGapFrames: vi.fn(),
      contextFrames: 12,
      setContextFrames: vi.fn(),
      replaceMode: false,
      setReplaceMode: vi.fn(),
      prompt: 'bridge these clips',
      setPrompt: vi.fn(),
      negativePrompt: 'blurry',
      setNegativePrompt: vi.fn(),
    },
    motionConfig: {
      availableLoras: [],
      projectId: 'project-1',
      loraPersistenceKey: 'join-clips-loras',
    },
    uiState: {
      onGenerate: vi.fn(),
      isGenerating: false,
      generateSuccess: false,
      generateButtonText: 'Generate',
    },
  };
}

describe('resolveJoinClipsSettingsFormProps', () => {
  it('merges clip, motion, and ui props into a single object', () => {
    const resolved = resolveJoinClipsSettingsFormProps(buildProps());

    expect(resolved.gapFrames).toBe(8);
    expect(resolved.contextFrames).toBe(12);
    expect(resolved.projectId).toBe('project-1');
    expect(resolved.generateButtonText).toBe('Generate');
    expect(typeof resolved.onGenerate).toBe('function');
  });
});
