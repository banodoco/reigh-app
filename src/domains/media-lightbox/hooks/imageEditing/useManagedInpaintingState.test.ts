// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ADVANCED_SETTINGS } from '../../model/editSettingsTypes';

const mocks = vi.hoisted(() => ({
  useInpainting: vi.fn(),
  useEditSettingsSync: vi.fn(),
  setIsInpaintMode: vi.fn(),
  setEditMode: vi.fn(),
  setInpaintPrompt: vi.fn(),
  setInpaintNumGenerations: vi.fn(),
  handleEnterInpaintMode: vi.fn(),
  handleGenerateInpaint: vi.fn(),
  handleGenerateAnnotatedEdit: vi.fn(),
}));

vi.mock('../useInpainting', () => ({
  useInpainting: (...args: unknown[]) => mocks.useInpainting(...args),
}));

vi.mock('../persistence/useEditSettingsSync', () => ({
  useEditSettingsSync: (...args: unknown[]) => mocks.useEditSettingsSync(...args),
}));

import { useManagedInpaintingState } from './useManagedInpaintingState';

describe('useManagedInpaintingState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useInpainting.mockReturnValue({
      isInpaintMode: true,
      editMode: 'text',
      setIsInpaintMode: mocks.setIsInpaintMode,
      setEditMode: mocks.setEditMode,
      brushStrokes: ['stroke'],
      inpaintPrompt: 'existing prompt',
      inpaintNumGenerations: 3,
      setInpaintPrompt: mocks.setInpaintPrompt,
      setInpaintNumGenerations: mocks.setInpaintNumGenerations,
      handleEnterInpaintMode: mocks.handleEnterInpaintMode,
      handleGenerateInpaint: mocks.handleGenerateInpaint,
      handleGenerateAnnotatedEdit: mocks.handleGenerateAnnotatedEdit,
    });
  });

  it('normalizes edit mode and forwards variant-specific media context to useInpainting', () => {
    renderHook(() =>
      useManagedInpaintingState({
        media: { id: 'media-1', thumbUrl: 'thumb.png' } as never,
        selectedProjectId: 'project-1',
        actualGenerationId: null,
        shotId: 'shot-1',
        toolTypeOverride: 'image-edit',
        imageContainerRef: { current: null },
        imageDimensions: { width: 100, height: 200 },
        effectiveEditModeLoras: [{ url: 'lora.safetensors', strength: 0.75 }],
        activeVariant: { id: 'variant-1', location: 'variant.png' },
        effectiveImageUrl: 'fallback.png',
        thumbnailUrl: undefined,
        createAsGeneration: true,
        advancedSettings: DEFAULT_ADVANCED_SETTINGS,
        qwenEditModel: 'qwen-edit',
        persistedEditMode: 'img2img',
        persistedNumGenerations: 2,
        persistedPrompt: 'persisted prompt',
        isEditSettingsReady: true,
        hasPersistedSettings: true,
        setPersistedEditMode: vi.fn(),
        setPersistedNumGenerations: vi.fn(),
        setPersistedPrompt: vi.fn(),
      }),
    );

    expect(mocks.useInpainting).toHaveBeenCalledWith(
      expect.objectContaining({
        activeVariantId: 'variant-1',
        activeVariantLocation: 'variant.png',
        imageUrl: 'variant.png',
        thumbnailUrl: 'thumb.png',
        initialEditMode: 'text',
      }),
    );
    expect(mocks.useEditSettingsSync).toHaveBeenCalledWith(
      expect.objectContaining({
        actualGenerationId: undefined,
        editMode: 'text',
        inpaintNumGenerations: 3,
        inpaintPrompt: 'existing prompt',
      }),
    );
  });

  it('exits inpaint mode by clearing the inpaint flag', () => {
    const { result } = renderHook(() =>
      useManagedInpaintingState({
        media: { id: 'media-1', thumbUrl: 'thumb.png' } as never,
        selectedProjectId: 'project-1',
        actualGenerationId: 'gen-1',
        imageContainerRef: { current: null },
        imageDimensions: null,
        effectiveEditModeLoras: undefined,
        activeVariant: null,
        effectiveImageUrl: 'fallback.png',
        thumbnailUrl: 'thumb-override.png',
        createAsGeneration: false,
        advancedSettings: DEFAULT_ADVANCED_SETTINGS,
        qwenEditModel: 'qwen-edit',
        persistedEditMode: 'annotate',
        persistedNumGenerations: 1,
        persistedPrompt: '',
        isEditSettingsReady: false,
        hasPersistedSettings: false,
        setPersistedEditMode: vi.fn(),
        setPersistedNumGenerations: vi.fn(),
        setPersistedPrompt: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleExitInpaintMode();
    });

    expect(mocks.setIsInpaintMode).toHaveBeenCalledWith(false);
  });
});
