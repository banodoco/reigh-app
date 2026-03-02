import { describe, expect, it, vi } from 'vitest';
import { verifyHuggingFaceToken } from './huggingFaceTokenVerifier';

describe('verifyHuggingFaceToken', () => {
  it('returns valid result with username on successful whoami response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ name: 'hf-user' }),
    });

    const result = await verifyHuggingFaceToken('token-1', fetchImpl as never);

    expect(fetchImpl).toHaveBeenCalledWith('https://huggingface.co/api/whoami-v2', {
      headers: { Authorization: 'Bearer token-1' },
    });
    expect(result).toEqual({ valid: true, username: 'hf-user' });
  });

  it('returns invalid-token error for 401 responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    const result = await verifyHuggingFaceToken('token-2', fetchImpl as never);

    expect(result).toEqual({ valid: false, error: 'Invalid token' });
  });

  it('returns api status error for non-401 failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    const result = await verifyHuggingFaceToken('token-3', fetchImpl as never);

    expect(result).toEqual({ valid: false, error: 'HuggingFace API error: 503' });
  });

  it('returns connectivity error when fetch throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));

    const result = await verifyHuggingFaceToken('token-4', fetchImpl as never);

    expect(result).toEqual({ valid: false, error: 'Failed to connect to HuggingFace' });
  });
});
