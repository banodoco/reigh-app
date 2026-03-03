import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useImageGenerationDetailsViewModel } from './useImageGenerationDetailsViewModel';

vi.mock('@/shared/lib/loraUtils', () => ({
  getDisplayNameFromUrl: (url: string, _unused?: unknown, fallback?: string) =>
    fallback || `display:${url.split('/').pop()}`,
}));

describe('useImageGenerationDetailsViewModel', () => {
  it('uses panel variant mobile lengths and active-lora metadata precedence', () => {
    const { result } = renderHook(() =>
      useImageGenerationDetailsViewModel({
        variant: 'panel',
        isMobile: true,
        metadata: {
          prompt: 'prompt text',
          negative_prompt: 'neg text',
          width: 1280,
          height: 720,
          activeLoras: [
            { id: 'lora-1', name: 'cinematic', path: 'https://hf.co/cinematic', strength: 75 },
          ],
          originalParams: {
            orchestrator_details: {
              additional_loras: { 'https://hf.co/unused': 0.6 },
            },
          },
        } as never,
      }),
    );

    expect(result.current.config.promptLength).toBe(100);
    expect(result.current.config.negativePromptLength).toBe(100);
    expect(result.current.dimensions).toBe('1280×720');
    expect(result.current.lorasToDisplay).toEqual([
      { name: 'cinematic', strength: '75%' },
    ]);
  });

  it('falls back to additional_loras and formats strengths as percentages', () => {
    const { result } = renderHook(() =>
      useImageGenerationDetailsViewModel({
        variant: 'hover',
        isMobile: false,
        metadata: {
          originalParams: {
            orchestrator_details: {
              additional_loras: {
                'https://hf.co/style-a': 0.5,
                'https://hf.co/style-b': 1.0,
              },
            },
          },
        } as never,
      }),
    );

    expect(result.current.lorasToDisplay).toEqual([
      { name: 'display:style-a', strength: '50%' },
      { name: 'display:style-b', strength: '100%' },
    ]);
    expect(result.current.config.maxLoras).toBe(2);
  });

  it('derives style reference sizing, qwen source, and user image filename', () => {
    const { result } = renderHook(() =>
      useImageGenerationDetailsViewModel({
        variant: 'modal',
        isMobile: false,
        metadata: {
          tool_type: 'qwen_image_edit',
          image: 'https://example.com/source.png',
          userProvidedImageUrl: 'https://cdn.example.com/uploads/original-input.jpg',
          style_reference_image: 'https://example.com/style.png',
          style_reference_strength: 0.8,
          subject_strength: 0.4,
          scene_reference_strength: 0.2,
          resolution: '1920x1080',
          originalParams: {
            resolution: '1920x1080',
          },
        } as never,
      }),
    );

    expect(result.current.isQwenImageEdit).toBe(true);
    expect(result.current.qwenSourceImage).toBe('https://example.com/source.png');
    expect(result.current.userProvidedImageFilename).toBe('original-input.jpg');
    expect(result.current.styleReference).toEqual(
      expect.objectContaining({
        image: 'https://example.com/style.png',
        styleStrength: 0.8,
        subjectStrength: 0.4,
        sceneStrength: 0.2,
        imageWidth: 120,
      }),
    );
    expect(result.current.styleReference?.imageHeight).toBeCloseTo(67.5);
  });
});
