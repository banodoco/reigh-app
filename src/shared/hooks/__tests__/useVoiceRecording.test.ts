import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/lib/errorUtils', () => ({
  getErrorMessage: vi.fn((err: Error) => err?.message || 'Unknown error'),
  isError: vi.fn((err: unknown) => err instanceof Error),
}));

import { useVoiceRecording } from '../use-voice-recording';

describe('useVoiceRecording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial idle state', () => {
    const { result } = renderHook(() => useVoiceRecording());

    expect(result.current.state).toBe('idle');
    expect(result.current.audioLevel).toBe(0);
    expect(result.current.remainingSeconds).toBe(15);
    expect(result.current.isRecording).toBe(false);
    expect(result.current.isProcessing).toBe(false);
    expect(result.current.isActive).toBe(false);
  });

  it('returns all expected functions', () => {
    const { result } = renderHook(() => useVoiceRecording());

    expect(typeof result.current.startRecording).toBe('function');
    expect(typeof result.current.stopRecording).toBe('function');
    expect(typeof result.current.cancelRecording).toBe('function');
    expect(typeof result.current.toggleRecording).toBe('function');
  });

  it('stopRecording does nothing when not recording', () => {
    const { result } = renderHook(() => useVoiceRecording());

    // Should not throw
    act(() => {
      result.current.stopRecording();
    });

    expect(result.current.state).toBe('idle');
  });

  it('cancelRecording does nothing when not recording', () => {
    const { result } = renderHook(() => useVoiceRecording());

    // Should not throw
    act(() => {
      result.current.cancelRecording();
    });

    expect(result.current.state).toBe('idle');
  });

  it('calls onError when microphone access is denied', async () => {
    const mockGetUserMedia = vi.fn().mockRejectedValue(
      Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });

    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecording({ onError })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('Microphone access denied')
    );
    expect(result.current.state).toBe('idle');
  });

  it('calls onError when no microphone found', async () => {
    const mockGetUserMedia = vi.fn().mockRejectedValue(
      Object.assign(new Error('No mic'), { name: 'NotFoundError' })
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });

    const onError = vi.fn();
    const { result } = renderHook(() =>
      useVoiceRecording({ onError })
    );

    await act(async () => {
      await result.current.startRecording();
    });

    expect(onError).toHaveBeenCalledWith(
      expect.stringContaining('No microphone found')
    );
  });
});
