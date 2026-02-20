import { describe, expect, it } from 'vitest';
import { jsonResponse } from './http.ts';

describe('_shared/http', () => {
  it('returns JSON response with expected status and CORS headers', async () => {
    const response = jsonResponse({ ok: true }, 201);
    expect(response.status).toBe(201);
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
