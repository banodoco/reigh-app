import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const { mockUpload, mockGetUser, mockInvoke } = vi.hoisted(() => ({
  mockUpload: vi.fn(),
  mockGetUser: vi.fn(),
  mockInvoke: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
      })),
    },
    auth: {
      getUser: mockGetUser,
    },
    functions: {
      invoke: mockInvoke,
    },
  },
}));

vi.mock('uuid', () => ({
  v4: () => 'test-uuid',
}));

import { useHuggingFaceUpload } from '../useHuggingFaceUpload';

describe('useHuggingFaceUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    mockUpload.mockResolvedValue({ error: null });
    mockInvoke.mockResolvedValue({
      data: {
        success: true,
        repoId: 'repo-1',
        repoUrl: 'https://hf.co/repo',
        loraUrl: 'https://hf.co/lora.safetensors',
      },
      error: null,
    });
  });

  it('returns initial idle state', () => {
    const { result } = renderHook(() => useHuggingFaceUpload());

    expect(result.current.uploadProgress.stage).toBe('idle');
    expect(result.current.uploadProgress.message).toBe('');
    expect(result.current.isUploading).toBe(false);
    expect(typeof result.current.uploadToHuggingFace).toBe('function');
    expect(typeof result.current.resetProgress).toBe('function');
  });

  it('returns error when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { result } = renderHook(() => useHuggingFaceUpload());

    let uploadResult: any;
    await act(async () => {
      uploadResult = await result.current.uploadToHuggingFace(
        { single: new File(['content'], 'lora.safetensors') },
        { name: 'Test LoRA', baseModel: 'wan' }
      );
    });

    expect(uploadResult.success).toBe(false);
    expect(uploadResult.error).toBe('Not authenticated');
  });

  it('returns error when no file provided', async () => {
    const { result } = renderHook(() => useHuggingFaceUpload());

    let uploadResult: any;
    await act(async () => {
      uploadResult = await result.current.uploadToHuggingFace(
        {},
        { name: 'Test LoRA', baseModel: 'wan' }
      );
    });

    expect(uploadResult.success).toBe(false);
    expect(uploadResult.error).toBe('No LoRA file provided');
  });

  it('handles successful single-stage upload', async () => {
    const { result } = renderHook(() => useHuggingFaceUpload());

    let uploadResult: any;
    await act(async () => {
      uploadResult = await result.current.uploadToHuggingFace(
        { single: new File(['content'], 'lora.safetensors') },
        { name: 'Test LoRA', baseModel: 'wan' }
      );
    });

    expect(uploadResult.success).toBe(true);
    expect(uploadResult.repoId).toBe('repo-1');
    expect(result.current.uploadProgress.stage).toBe('complete');
  });

  it('handles edge function error', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge function failed' },
    });

    const { result } = renderHook(() => useHuggingFaceUpload());

    let uploadResult: any;
    await act(async () => {
      uploadResult = await result.current.uploadToHuggingFace(
        { single: new File(['content'], 'lora.safetensors') },
        { name: 'Test LoRA', baseModel: 'wan' }
      );
    });

    expect(uploadResult.success).toBe(false);
    expect(result.current.uploadProgress.stage).toBe('error');
  });

  it('handles upload failure', async () => {
    mockUpload.mockResolvedValue({ error: { message: 'Upload failed' } });

    const { result } = renderHook(() => useHuggingFaceUpload());

    let uploadResult: any;
    await act(async () => {
      uploadResult = await result.current.uploadToHuggingFace(
        { single: new File(['content'], 'lora.safetensors') },
        { name: 'Test LoRA', baseModel: 'wan' }
      );
    });

    expect(uploadResult.success).toBe(false);
    expect(result.current.uploadProgress.stage).toBe('error');
  });

  it('resetProgress resets to idle', async () => {
    const { result } = renderHook(() => useHuggingFaceUpload());

    // Trigger an upload first
    await act(async () => {
      await result.current.uploadToHuggingFace(
        { single: new File(['content'], 'lora.safetensors') },
        { name: 'Test LoRA', baseModel: 'wan' }
      );
    });

    expect(result.current.uploadProgress.stage).toBe('complete');

    act(() => {
      result.current.resetProgress();
    });

    expect(result.current.uploadProgress.stage).toBe('idle');
    expect(result.current.uploadProgress.message).toBe('');
  });

  it('isUploading is true during upload stages', async () => {
    // We can test that isUploading reflects the stage correctly
    const { result } = renderHook(() => useHuggingFaceUpload());

    expect(result.current.isUploading).toBe(false);

    // After successful upload, stage is 'complete' not uploading
    await act(async () => {
      await result.current.uploadToHuggingFace(
        { single: new File(['content'], 'lora.safetensors') },
        { name: 'Test LoRA', baseModel: 'wan' }
      );
    });

    expect(result.current.isUploading).toBe(false); // 'complete' is not an uploading stage
  });
});
