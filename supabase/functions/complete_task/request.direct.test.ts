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
      expect(await result.response.text()).toContain('Multipart upload');
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
