import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EDIT_MODE_LORA_URLS } from '@/domains/lora/lib/loraUtils';
import { useEditModeLoras } from './useEditModeLoRAs';

describe('useEditModeLoras', () => {
  it('defaults to no LoRA preset', () => {
    const { result } = renderHook(() => useEditModeLoras());

    expect(result.current.loraMode).toBe('none');
    expect(result.current.editModeLoras).toBeUndefined();
    expect(result.current.isInSceneBoostEnabled).toBe(false);
  });

  it('maps in-scene mode to preset URL', () => {
    const { result } = renderHook(() => useEditModeLoras());

    act(() => {
      result.current.setLoraMode('in-scene');
    });

    expect(result.current.editModeLoras).toEqual([
      {
        url: EDIT_MODE_LORA_URLS['in-scene'],
        strength: 1,
      },
    ]);
    expect(result.current.isInSceneBoostEnabled).toBe(true);
  });

  it('maps next-scene mode to preset URL', () => {
    const { result } = renderHook(() => useEditModeLoras());

    act(() => {
      result.current.setLoraMode('next-scene');
    });

    expect(result.current.editModeLoras).toEqual([
      {
        url: EDIT_MODE_LORA_URLS['next-scene'],
        strength: 1,
      },
    ]);
  });

  it('uses trimmed custom URL only when present', () => {
    const { result } = renderHook(() => useEditModeLoras());

    act(() => {
      result.current.setLoraMode('custom');
      result.current.setCustomLoraUrl('   ');
    });
    expect(result.current.editModeLoras).toBeUndefined();

    act(() => {
      result.current.setCustomLoraUrl('  https://example.com/custom.safetensors  ');
    });

    expect(result.current.editModeLoras).toEqual([
      {
        url: 'https://example.com/custom.safetensors',
        strength: 1,
      },
    ]);
  });

  it('supports legacy boolean toggle API', () => {
    const { result } = renderHook(() => useEditModeLoras());

    act(() => {
      result.current.setIsInSceneBoostEnabled(true);
    });
    expect(result.current.loraMode).toBe('in-scene');

    act(() => {
      result.current.setIsInSceneBoostEnabled(false);
    });
    expect(result.current.loraMode).toBe('none');
    expect(result.current.editModeLoras).toBeUndefined();
  });

  it('reports isInSceneBoostEnabled as true for all non-none modes', () => {
    const { result } = renderHook(() => useEditModeLoras());

    for (const mode of ['in-scene', 'next-scene', 'custom'] as const) {
      act(() => {
        result.current.setLoraMode(mode);
      });
      expect(result.current.isInSceneBoostEnabled).toBe(true);
    }

    act(() => {
      result.current.setLoraMode('none');
    });
    expect(result.current.isInSceneBoostEnabled).toBe(false);
  });
});
