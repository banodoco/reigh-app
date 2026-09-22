import { describe, expect, it, vi } from 'vitest';

const getGenerationMock = vi.hoisted(() => vi.fn());

vi.mock('@/app/runtime/runtimeDocument', () => ({
  getRuntimeDocumentProjectId: () => 'runtime-project',
}));
vi.mock('@/integrations/runtime/client', () => ({
  ReighRuntimeClient: class {
    getGeneration = (...args: unknown[]) => getGenerationMock(...args);
  },
}));
vi.mock('@/integrations/astrid/client', () => ({
  AstridLocalClient: class {
    constructor() {
      throw new Error('Runtime task mapping must not initialize the bridge');
    }
  },
}));

import { resolveGenerationTaskMapping } from './generationTaskRepository';

describe('generation task mapping Runtime authority', () => {
  it('uses source_task_id from the Runtime generation', async () => {
    getGenerationMock.mockResolvedValue({
      generation_id: 'generation-1',
      project_id: 'runtime-project',
      source_task_id: 'task-1',
    });

    await expect(resolveGenerationTaskMapping('generation-1')).resolves.toEqual({
      generationId: 'generation-1',
      taskId: 'task-1',
      status: 'ok',
    });
    expect(getGenerationMock).toHaveBeenCalledWith('generation-1');
  });
});
