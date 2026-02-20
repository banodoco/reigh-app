import { describe, expect, it, vi } from 'vitest';

import { parseAndValidateRequest } from './request.ts';

function createLoggerStub() {
  return {
    error: vi.fn(),
    flush: vi.fn(async () => {}),
  } as unknown as Parameters<typeof parseAndValidateRequest>[1];
}

describe('parseAndValidateRequest', () => {
  it('parses a valid request', async () => {
    const logger = createLoggerStub();
    const req = new Request('http://localhost/update-task-status', {
      method: 'POST',
      body: JSON.stringify({ task_id: 'task-1', status: 'Queued' }),
    });

    const result = await parseAndValidateRequest(req, logger);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.task_id).toBe('task-1');
      expect(result.data.status).toBe('Queued');
    }
  });

  it('rejects invalid JSON', async () => {
    const logger = createLoggerStub();
    const req = new Request('http://localhost/update-task-status', {
      method: 'POST',
      body: '{bad-json',
    });

    const result = await parseAndValidateRequest(req, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });

  it('rejects invalid status values', async () => {
    const logger = createLoggerStub();
    const req = new Request('http://localhost/update-task-status', {
      method: 'POST',
      body: JSON.stringify({ task_id: 'task-1', status: 'pending' }),
    });

    const result = await parseAndValidateRequest(req, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
    }
  });

  it('rejects malformed attempts type', async () => {
    const logger = createLoggerStub();
    const req = new Request('http://localhost/update-task-status', {
      method: 'POST',
      body: JSON.stringify({ task_id: 'task-1', status: 'Queued', attempts: '3' }),
    });

    const result = await parseAndValidateRequest(req, logger);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(400);
      const body = JSON.parse(await result.response.text()) as Record<string, unknown>;
      expect(body.message).toBe('attempts must be a number');
    }
  });
});
