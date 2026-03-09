import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import { useImageLightboxEnvironment } from '../useImageLightboxEnvironment';

const mocks = vi.hoisted(() => ({
  useProject: vi.fn(),
  usePanes: vi.fn(),
  useUserUIState: vi.fn(),
  usePublicLoras: vi.fn(),
  useLoraManager: vi.fn(),
  useIsMobile: vi.fn(),
  getGenerationId: vi.fn(),
  useUpscale: vi.fn(),
  useEditSettingsPersistence: vi.fn(),
  extractDimensionsFromMedia: vi.fn(),
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProject: (...args: unknown[]) => mocks.useProject(...args),
}));

vi.mock('@/shared/contexts/PanesContext', () => ({
  usePanes: (...args: unknown[]) => mocks.usePanes(...args),
}));

vi.mock('@/shared/hooks/useUserUIState', () => ({
  useUserUIState: (...args: unknown[]) => mocks.useUserUIState(...args),
}));

vi.mock('@/shared/hooks/useResources', () => ({
  usePublicLoras: (...args: unknown[]) => mocks.usePublicLoras(...args),
}));

vi.mock('@/domains/lora/hooks/useLoraManager', () => ({
  useLoraManager: (...args: unknown[]) => mocks.useLoraManager(...args),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: (...args: unknown[]) => mocks.useIsMobile(...args),
}));

vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({
  getGenerationId: (...args: unknown[]) => mocks.getGenerationId(...args),
}));

vi.mock('../useUpscale', () => ({
  useUpscale: (...args: unknown[]) => mocks.useUpscale(...args),
}));

vi.mock('../persistence/useEditSettingsPersistence', () => ({
  useEditSettingsPersistence: (...args: unknown[]) => mocks.useEditSettingsPersistence(...args),
}));

vi.mock('../../utils/dimensions', () => ({
  extractDimensionsFromMedia: (...args: unknown[]) => mocks.extractDimensionsFromMedia(...args),
}));

function createMedia(overrides: Partial<GenerationRow> = {}): GenerationRow {
  return {
    id: 'media-1',
    parent_generation_id: 'parent-1',
    ...overrides,
  } as unknown as GenerationRow;
}

describe('useImageLightboxEnvironment', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useProject.mockReturnValue({
      project: { aspectRatio: '16:9' },
      selectedProjectId: 'project-1',
    });
    mocks.usePanes.mockReturnValue({
      isTasksPaneOpen: false,
      tasksPaneWidth: 320,
      isTasksPaneLocked: true,
    });
    mocks.useUserUIState.mockReturnValue({
      value: { onComputer: true, inCloud: false },
    });
    mocks.usePublicLoras.mockReturnValue({
      data: [{ id: 'pub-1' }],
    });
    mocks.useLoraManager.mockReturnValue({
      selectedLoras: [{ path: 'lora://selected', strength: 0.8 }],
    });
    mocks.useIsMobile.mockReturnValue(true);
    mocks.getGenerationId.mockReturnValue('gen-1');
    mocks.useUpscale.mockReturnValue({
      isUpscaling: false,
      effectiveImageUrl: 'https://img.example/current.png',
      handleUpscale: vi.fn(),
    });
    mocks.useEditSettingsPersistence.mockReturnValue({
      editModeLoras: [{ url: 'lora://fallback', strength: 0.4 }],
    });
    mocks.extractDimensionsFromMedia.mockReturnValue({ width: 640, height: 360 });
  });

  it('builds environment with explicit task pane overrides and selected LoRA precedence', () => {
    const media = createMedia();
    const { result } = renderHook(() =>
      useImageLightboxEnvironment({
        media,
        shotId: 'shot-1',
        tasksPaneOpen: true,
        tasksPaneWidth: 900,
      }),
    );

    expect(result.current.selectedProjectId).toBe('project-1');
    expect(result.current.projectAspectRatio).toBe('16:9');
    expect(result.current.isMobile).toBe(true);
    expect(result.current.isCloudMode).toBe(false);
    expect(result.current.isLocalGeneration).toBe(true);
    expect(result.current.isTasksPaneLocked).toBe(true);
    expect(result.current.effectiveTasksPaneOpen).toBe(true);
    expect(result.current.effectiveTasksPaneWidth).toBe(900);
    expect(result.current.actualGenerationId).toBe('gen-1');
    expect(result.current.variantFetchGenerationId).toBe('parent-1');
    expect(result.current.imageDimensions).toEqual({ width: 640, height: 360 });

    expect(result.current.effectiveEditModeLoras).toEqual([
      { url: 'lora://selected', strength: 0.8 },
    ]);

    expect(mocks.useUpscale).toHaveBeenCalledWith({
      media,
      selectedProjectId: 'project-1',
      isVideo: false,
      shotId: 'shot-1',
    });
    expect(mocks.useEditSettingsPersistence).toHaveBeenCalledWith({
      generationId: 'gen-1',
      projectId: 'project-1',
      enabled: true,
    });
  });

  it('falls back to context pane values, fallback LoRAs, and updates dimensions on media change', () => {
    mocks.useLoraManager.mockReturnValue({
      selectedLoras: [],
    });
    mocks.extractDimensionsFromMedia.mockImplementation((media: GenerationRow) => {
      if ((media as { id?: string }).id === 'media-2') {
        return { width: 1024, height: 512 };
      }
      return { width: 640, height: 360 };
    });

    const { result, rerender } = renderHook(
      (props: { media: GenerationRow }) =>
        useImageLightboxEnvironment({
          media: props.media,
        }),
      {
        initialProps: { media: createMedia({ parent_generation_id: undefined }) },
      },
    );

    expect(result.current.effectiveTasksPaneOpen).toBe(false);
    expect(result.current.effectiveTasksPaneWidth).toBe(320);
    expect(result.current.variantFetchGenerationId).toBe('gen-1');
    expect(result.current.effectiveEditModeLoras).toEqual([
      { url: 'lora://fallback', strength: 0.4 },
    ]);
    expect(result.current.imageDimensions).toEqual({ width: 640, height: 360 });

    rerender({ media: createMedia({ id: 'media-2', parent_generation_id: undefined }) });
    expect(result.current.imageDimensions).toEqual({ width: 1024, height: 512 });
  });

  it('derives isCloudMode and isLocalGeneration from generationMethods UI state', () => {
    mocks.useUserUIState.mockReturnValue({
      value: { onComputer: false, inCloud: true },
    });

    const { result } = renderHook(() =>
      useImageLightboxEnvironment({ media: createMedia() }),
    );

    expect(result.current.isCloudMode).toBe(true);
    expect(result.current.isLocalGeneration).toBe(false);
  });
});
