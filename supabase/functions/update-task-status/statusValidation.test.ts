import { describe, expect, it, vi } from 'vitest';

import { validateStatusTransition } from './statusValidation.ts';

function loggerStub() {
  return {
    warn: vi.fn(),
  } as unknown as Parameters<typeof validateStatusTransition>[0];
}

describe('validateStatusTransition', () => {
  it('returns null for allowed transitions', () => {
    const logger = loggerStub();
    const response = validateStatusTransition(logger, 'task-1', 'Queued', 'In Progress');
    expect(response).toBeNull();
  });

  it('returns conflict response for invalid transitions', async () => {
    const logger = loggerStub();
    const response = validateStatusTransition(logger, 'task-1', 'Complete', 'Queued');

    expect(response).toBeInstanceOf(Response);
    expect(response?.status).toBe(409);

    const body = JSON.parse(await response!.text()) as Record<string, unknown>;
    expect(body.current_status).toBe('Complete');
    expect(body.requested_status).toBe('Queued');
    expect(body.allowed_transitions).toEqual([]);
  });

  it('does not block unknown current status values', () => {
    const logger = loggerStub();
    const response = validateStatusTransition(logger, 'task-1', 'UnknownStatus', 'Queued');
    expect(response).toBeNull();
  });
});
