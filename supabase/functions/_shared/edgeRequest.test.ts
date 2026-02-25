import { describe, expect, it } from 'vitest';
import {
  parseJsonBody,
  parseJsonBodyStrict,
  parseJsonFailureResponse,
} from './edgeRequest.ts';

describe('edgeRequest JSON parsing', () => {
  it('fails strict parsing when JSON is not an object', async () => {
    const request = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify(123),
    });

    const result = await parseJsonBody(request, undefined, { mode: 'strict' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('invalid_json_body_shape');
      expect(result.message).toBe('JSON body must be an object');
    }
  });

  it('coerces non-object JSON to empty object in loose mode', async () => {
    const request = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify(['x']),
    });

    const result = await parseJsonBody(request, undefined, { mode: 'loose' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({});
      expect(result.policy).toBe('fail_open');
    }
  });

  it('returns strict operation result for invalid body', async () => {
    const request = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify(true),
    });

    const parsed = await parseJsonBodyStrict(request, undefined, { mode: 'strict' });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.errorCode).toBe('invalid_json_body_shape');
      expect(parsed.recoverable).toBe(false);
    }
  });

  it('maps strict parse failures to consistent error responses', async () => {
    const request = new Request('http://localhost/test', {
      method: 'POST',
      body: JSON.stringify(true),
    });

    const parsed = await parseJsonBodyStrict(request, undefined, { mode: 'strict' });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      throw new Error('Expected strict parse to fail');
    }

    const response = parseJsonFailureResponse(parsed, 422);
    expect(response.status).toBe(422);
    const payload = await response.json();
    expect(payload?.error).toBe('invalid_json_body_shape');
  });
});
