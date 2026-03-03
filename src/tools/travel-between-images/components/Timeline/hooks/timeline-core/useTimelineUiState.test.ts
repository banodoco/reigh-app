import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTimelineUiState } from './useTimelineUiState';

describe('useTimelineUiState', () => {
  it('exposes default values and max gap contract', () => {
    const { result } = renderHook(() => useTimelineUiState());

    expect(result.current.resetGap).toBe(50);
    expect(result.current.maxGap).toBe(81);
    expect(result.current.showVideoBrowser).toBe(false);
    expect(result.current.isUploadingStructureVideo).toBe(false);
  });

  it('updates state through setter callbacks', () => {
    const { result } = renderHook(() => useTimelineUiState());

    act(() => {
      result.current.setResetGap(72);
      result.current.setShowVideoBrowser(true);
      result.current.setIsUploadingStructureVideo(true);
    });

    expect(result.current.resetGap).toBe(72);
    expect(result.current.showVideoBrowser).toBe(true);
    expect(result.current.isUploadingStructureVideo).toBe(true);
  });
});
