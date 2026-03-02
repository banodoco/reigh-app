import { describe, expect, it } from 'vitest';
import { parseCompleteTaskRequest, validateStoragePathSecurity } from './request.ts';

describe('complete_task request parser direct coverage', () => {
  it('rejects multipart requests', async () => {
    const req = new Request('https://edge.test/complete-task', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data' },
    });

    const result = await parseCompleteTaskRequest(req);

    expect(result.success).toBe(false);
    if (!result.success) {
      const payload = await result.response.json();
      expect(payload).toMatchObject({
        error: 'multipart_not_supported',
        errorCode: 'multipart_not_supported',
      });
      expect(payload.message).toContain('Multipart upload');
      expect(payload.recoverable).toBe(false);
    }
  });

  it('returns the shared edge error envelope for invalid JSON payloads', async () => {
    const req = new Request('https://edge.test/complete-task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    });

    const result = await parseCompleteTaskRequest(req);

    expect(result.success).toBe(false);
    if (!result.success) {
      const payload = await result.response.json();
      expect(payload).toMatchObject({
        error: 'invalid_json_body',
        errorCode: 'invalid_json_body',
        message: 'Invalid JSON body',
        recoverable: false,
      });
    }
  });

  it('uses shared strict JSON-body-shape failures for non-object payloads', async () => {
    const req = new Request('https://edge.test/complete-task', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(true),
    });

    const result = await parseCompleteTaskRequest(req);

    expect(result.success).toBe(false);
    if (!result.success) {
      const payload = await result.response.json();
      expect(payload).toMatchObject({
        error: 'invalid_json_body_shape',
        errorCode: 'invalid_json_body_shape',
        message: 'JSON body must be an object',
        recoverable: false,
      });
    }
  });

  it('allows matching storage path task ids', async () => {
    const security = await validateStoragePathSecurity(
      {} as never,
      'task-1',
      'user/tasks/task-1/file.png',
      'task-1',
    );

    expect(security).toEqual({ allowed: true });
  });
});
