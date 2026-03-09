import { beforeEach, describe, expect, it, vi } from 'vitest';
import { completeTaskHandler } from './handler.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  enforceRateLimit: vi.fn(),
  parseCompleteTaskRequest: vi.fn(),
  validateStoragePathSecurity: vi.fn(),
  handleStorageOperations: vi.fn(),
  getStoragePublicUrl: vi.fn(),
  cleanupFile: vi.fn(),
  setThumbnailInParams: vi.fn((params: Record<string, unknown>) => params),
  createGenerationFromTask: vi.fn(),
  checkOrchestratorCompletion: vi.fn(),
  validateAndCleanupShotId: vi.fn(),
  triggerCostCalculationIfNotSubTask: vi.fn(),
  completeTaskErrorResponse: vi.fn((message: string, status: number) =>
    new Response(JSON.stringify({ message }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
  fetchTaskContext: vi.fn(),
  markTaskFailed: vi.fn(),
  persistCompletionFollowUpIssues: vi.fn(),
  resolveTaskStorageActor: vi.fn(),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
}));

vi.mock('../_shared/http.ts', () => ({
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

vi.mock('../_shared/rateLimit.ts', () => ({
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
  RATE_LIMITS: {
    userAction: { maxRequests: 100, windowSeconds: 60 },
  },
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

vi.mock('../_shared/errorMessage.ts', () => ({
  toErrorMessage: (...args: unknown[]) => mocks.toErrorMessage(...args),
}));

vi.mock('../_shared/taskActorPolicy.ts', () => ({
  resolveTaskStorageActor: (...args: unknown[]) => mocks.resolveTaskStorageActor(...args),
}));

vi.mock('./request.ts', () => ({
  parseCompleteTaskRequest: (...args: unknown[]) => mocks.parseCompleteTaskRequest(...args),
  validateStoragePathSecurity: (...args: unknown[]) => mocks.validateStoragePathSecurity(...args),
}));

vi.mock('./storage.ts', () => ({
  handleStorageOperations: (...args: unknown[]) => mocks.handleStorageOperations(...args),
  getStoragePublicUrl: (...args: unknown[]) => mocks.getStoragePublicUrl(...args),
  cleanupFile: (...args: unknown[]) => mocks.cleanupFile(...args),
}));

vi.mock('./params.ts', () => ({
  setThumbnailInParams: (...args: unknown[]) => mocks.setThumbnailInParams(...args),
}));

vi.mock('./generation.ts', () => ({
  createGenerationFromTask: (...args: unknown[]) => mocks.createGenerationFromTask(...args),
}));

vi.mock('./orchestrator.ts', () => ({
  checkOrchestratorCompletion: (...args: unknown[]) => mocks.checkOrchestratorCompletion(...args),
}));

vi.mock('./shotValidation.ts', () => ({
  validateAndCleanupShotId: (...args: unknown[]) => mocks.validateAndCleanupShotId(...args),
}));

vi.mock('./billing.ts', () => ({
  triggerCostCalculationIfNotSubTask: (...args: unknown[]) => mocks.triggerCostCalculationIfNotSubTask(...args),
}));

vi.mock('./completionHelpers.ts', () => ({
  completeTaskErrorResponse: (...args: unknown[]) => mocks.completeTaskErrorResponse(...args),
  fetchTaskContext: (...args: unknown[]) => mocks.fetchTaskContext(...args),
  markTaskFailed: (...args: unknown[]) => mocks.markTaskFailed(...args),
  persistCompletionFollowUpIssues: (...args: unknown[]) => mocks.persistCompletionFollowUpIssues(...args),
}));

function createLogger() {
  return {
    setDefaultTaskId: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    debug: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createSupabaseAdmin() {
  const finalEq = vi.fn().mockResolvedValue({ error: null });
  const firstEq = vi.fn().mockReturnValue({ eq: finalEq });
  const update = vi.fn().mockReturnValue({ eq: firstEq });
  const from = vi.fn().mockReturnValue({ update });
  return { from, update, firstEq, finalEq };
}

describe('completeTaskHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
          if (key === 'SUPABASE_URL') return 'https://example.supabase.co';
          return undefined;
        },
      },
    });

    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.parseCompleteTaskRequest.mockResolvedValue({
      success: true,
      data: {
        taskId: 'task-1',
        mode: 'upload',
        filename: 'out.png',
        requiresOrchestratorCheck: false,
        storagePath: null,
        storagePathTaskId: null,
      },
    });
    mocks.resolveTaskStorageActor.mockResolvedValue({
      ok: true,
      value: {
        isServiceRole: true,
        taskOwnerVerified: true,
        callerId: 'service-role',
        taskUserId: 'user-1',
      },
    });
    mocks.fetchTaskContext.mockResolvedValue({
      id: 'task-1',
      task_type: 'image_generation',
      project_id: 'project-1',
      params: {},
      result_data: {},
      tool_type: 'wan',
      category: 'image',
      content_type: 'image',
      variant_type: null,
    });
    mocks.handleStorageOperations.mockResolvedValue({
      publicUrl: 'https://cdn.example.com/tasks/task-1/out.png',
      objectPath: 'tasks/user-1/task-1/out.png',
      thumbnailUrl: null,
    });
    mocks.validateAndCleanupShotId.mockResolvedValue({
      needsUpdate: false,
      updatedParams: {},
    });
    mocks.createGenerationFromTask.mockResolvedValue({ status: 'created' });
    mocks.checkOrchestratorCompletion.mockResolvedValue(undefined);
    mocks.triggerCostCalculationIfNotSubTask.mockResolvedValue({ ok: true });
    mocks.persistCompletionFollowUpIssues.mockResolvedValue({ ok: true });
  });

  it('returns bootstrap response when bootstrap fails', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response('blocked', { status: 401 }),
    });

    const response = await completeTaskHandler(
      new Request('https://edge.test/complete-task', { method: 'POST' }),
    );

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns parse failure response from request parser', async () => {
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger,
        auth: { userId: 'user-1', isServiceRole: false },
      },
    });

    mocks.parseCompleteTaskRequest.mockResolvedValue({
      success: false,
      response: new Response('invalid', { status: 400 }),
    });

    const response = await completeTaskHandler(
      new Request('https://edge.test/complete-task', { method: 'POST' }),
    );

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe('invalid');
  });

  it('completes task and returns success payload', async () => {
    const logger = createLogger();
    const supabaseAdmin = createSupabaseAdmin();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
        auth: { userId: null, isServiceRole: true },
      },
    });

    const response = await completeTaskHandler(
      new Request('https://edge.test/complete-task', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      public_url: 'https://cdn.example.com/tasks/task-1/out.png',
      thumbnail_url: null,
      follow_up: { status: 'ok', issues: [] },
      message: 'Task completed and file uploaded successfully',
    });

    expect(logger.setDefaultTaskId).toHaveBeenCalledWith('task-1');
    expect(mocks.resolveTaskStorageActor).toHaveBeenCalled();
    expect(mocks.fetchTaskContext).toHaveBeenCalled();
    expect(mocks.createGenerationFromTask).toHaveBeenCalled();
    expect(supabaseAdmin.from).toHaveBeenCalledWith('tasks');
    expect(logger.flush).toHaveBeenCalled();
  });
});
