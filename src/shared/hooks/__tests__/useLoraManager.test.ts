import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockUpdateSettings, mockToastError } = vi.hoisted(() => ({
  mockUpdateSettings: vi.fn().mockResolvedValue(undefined),
  mockToastError: vi.fn(),
}));

vi.mock('../useToolSettings', () => ({
  useToolSettings: vi.fn(() => ({
    settings: undefined,
    update: mockUpdateSettings,
    isUpdating: false,
  })),
}));

vi.mock('@/shared/lib/compat/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: mockToastError },
}));

// Mock LoraHeaderActions as a simple component
vi.mock('@/shared/components/LoraHeaderActions', () => ({
  LoraHeaderActions: () => null,
}));

import { useLoraManager } from '../useLoraManager';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';

const createMockLora = (id: string, name: string = 'Test LoRA'): LoraModel =>
  ({
    'Model ID': id,
    Name: name,
    'Model Files': [{ url: `https://hf.co/${id}/model.safetensors`, path: '' }],
    Images: [{ url: 'https://hf.co/preview.jpg' }],
    trigger_word: 'test_trigger',
  } as LoraModel);

describe('useLoraManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial state', () => {
    const { result } = renderHook(() => useLoraManager());

    expect(result.current.selectedLoras).toEqual([]);
    expect(result.current.isLoraModalOpen).toBe(false);
    expect(typeof result.current.handleAddLora).toBe('function');
    expect(typeof result.current.handleRemoveLora).toBe('function');
    expect(typeof result.current.handleLoraStrengthChange).toBe('function');
    expect(typeof result.current.markAsUserSet).toBe('function');
    expect(result.current.hasEverSetLoras).toBe(false);
    expect(result.current.shouldApplyDefaults).toBe(true);
  });

  it('handleAddLora adds a LoRA', () => {
    const { result } = renderHook(() => useLoraManager());
    const mockLora = createMockLora('lora-1', 'My LoRA');

    act(() => {
      result.current.handleAddLora(mockLora);
    });

    expect(result.current.selectedLoras).toHaveLength(1);
    expect(result.current.selectedLoras[0].id).toBe('lora-1');
    expect(result.current.selectedLoras[0].name).toBe('My LoRA');
    expect(result.current.selectedLoras[0].strength).toBe(1.0);
  });

  it('handleAddLora respects initialStrength', () => {
    const { result } = renderHook(() => useLoraManager());
    const mockLora = createMockLora('lora-1');

    act(() => {
      result.current.handleAddLora(mockLora, true, 0.75);
    });

    expect(result.current.selectedLoras[0].strength).toBe(0.75);
  });

  it('handleAddLora prevents duplicates', () => {
    const { result } = renderHook(() => useLoraManager());
    const mockLora = createMockLora('lora-1');

    act(() => {
      result.current.handleAddLora(mockLora);
    });

    act(() => {
      result.current.handleAddLora(mockLora);
    });

    expect(result.current.selectedLoras).toHaveLength(1);
  });

  it('handleRemoveLora removes a LoRA', () => {
    const { result } = renderHook(() => useLoraManager());
    const mockLora = createMockLora('lora-1');

    act(() => {
      result.current.handleAddLora(mockLora);
    });

    expect(result.current.selectedLoras).toHaveLength(1);

    act(() => {
      result.current.handleRemoveLora('lora-1');
    });

    expect(result.current.selectedLoras).toHaveLength(0);
  });

  it('handleLoraStrengthChange updates strength', () => {
    const { result } = renderHook(() => useLoraManager());
    const mockLora = createMockLora('lora-1');

    act(() => {
      result.current.handleAddLora(mockLora);
    });

    act(() => {
      result.current.handleLoraStrengthChange('lora-1', 0.5);
    });

    expect(result.current.selectedLoras[0].strength).toBe(0.5);
  });

  it('markAsUserSet sets hasEverSetLoras', () => {
    const { result } = renderHook(() => useLoraManager());

    expect(result.current.hasEverSetLoras).toBe(false);

    act(() => {
      result.current.markAsUserSet();
    });

    expect(result.current.hasEverSetLoras).toBe(true);
  });

  it('shouldApplyDefaults becomes false after adding a LoRA', () => {
    const { result } = renderHook(() => useLoraManager());

    expect(result.current.shouldApplyDefaults).toBe(true);

    act(() => {
      result.current.handleAddLora(createMockLora('lora-1'));
    });

    expect(result.current.shouldApplyDefaults).toBe(false);
  });

  it('setIsLoraModalOpen controls modal state', () => {
    const { result } = renderHook(() => useLoraManager());

    expect(result.current.isLoraModalOpen).toBe(false);

    act(() => {
      result.current.setIsLoraModalOpen(true);
    });

    expect(result.current.isLoraModalOpen).toBe(true);
  });

  it('setSelectedLoras replaces all LoRAs', () => {
    const { result } = renderHook(() => useLoraManager());

    act(() => {
      result.current.setSelectedLoras([
        { id: 'lora-a', name: 'A', path: 'a.safetensors', strength: 0.8 },
        { id: 'lora-b', name: 'B', path: 'b.safetensors', strength: 0.6 },
      ]);
    });

    expect(result.current.selectedLoras).toHaveLength(2);
  });

  it('handles LoRA with no Model Files', () => {
    const { result } = renderHook(() => useLoraManager());

    const badLora = {
      'Model ID': 'bad-lora',
      Name: 'Bad LoRA',
      'Model Files': [],
    } as LoraModel;

    act(() => {
      result.current.handleAddLora(badLora);
    });

    expect(result.current.selectedLoras).toHaveLength(0);
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('no model file')
    );
  });

  it('enables trigger words when option set', () => {
    const onPromptUpdate = vi.fn();
    const { result } = renderHook(() =>
      useLoraManager([], {
        enableTriggerWords: true,
        onPromptUpdate,
        currentPrompt: 'existing prompt',
      })
    );

    expect(result.current.handleAddTriggerWord).toBeDefined();

    act(() => {
      result.current.handleAddTriggerWord?.('my_trigger');
    });

    expect(onPromptUpdate).toHaveBeenCalledWith('existing prompt, my_trigger');
  });

  it('handleAddTriggerWord starts new prompt when empty', () => {
    const onPromptUpdate = vi.fn();
    const { result } = renderHook(() =>
      useLoraManager([], {
        enableTriggerWords: true,
        onPromptUpdate,
        currentPrompt: '',
      })
    );

    act(() => {
      result.current.handleAddTriggerWord?.('my_trigger');
    });

    expect(onPromptUpdate).toHaveBeenCalledWith('my_trigger');
  });

  it('does not include project persistence when not enabled', () => {
    const { result } = renderHook(() => useLoraManager());

    expect(result.current.handleSaveProjectLoras).toBeUndefined();
    expect(result.current.handleLoadProjectLoras).toBeUndefined();
    expect(result.current.hasSavedLoras).toBeUndefined();
  });

  it('includes project persistence when enabled', () => {
    const { result } = renderHook(() =>
      useLoraManager([], {
        enableProjectPersistence: true,
        projectId: 'proj-1',
      })
    );

    expect(typeof result.current.handleSaveProjectLoras).toBe('function');
    expect(typeof result.current.handleLoadProjectLoras).toBe('function');
  });

  it('detects multi-stage LoRAs', () => {
    const { result } = renderHook(() => useLoraManager());

    const multiStageLora = {
      'Model ID': 'multi-lora',
      Name: 'Multi-Stage LoRA',
      'Model Files': [{ url: 'main.safetensors', path: '' }],
      Images: [],
      high_noise_url: 'high_noise.safetensors',
      low_noise_url: 'low_noise.safetensors',
    } as LoraModel;

    act(() => {
      result.current.handleAddLora(multiStageLora);
    });

    expect(result.current.selectedLoras[0].isMultiStage).toBe(true);
    expect(result.current.selectedLoras[0].lowNoisePath).toBe('low_noise.safetensors');
  });
});
