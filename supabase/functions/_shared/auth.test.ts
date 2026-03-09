import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authenticateRequest, verifyProjectOwnership } from './auth.ts';

interface PatLookupResult {
  data: { user_id: string } | null;
  error: { message: string } | null;
}

function installDenoEnv(overrides?: Record<string, string | undefined>) {
  const envValues: Record<string, string | undefined> = {
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
    ...overrides,
  };

  vi.stubGlobal('Deno', {
    env: {
      get: (key: string) => envValues[key],
    },
  });
}

function createSupabaseAdminMock(options?: {
  jwtUser?: {
    id: string;
    role?: string;
    appRole?: string;
  } | null;
  jwtError?: { message: string } | null;
  patLookup?: PatLookupResult;
}) {
  const singleMock = vi.fn().mockResolvedValue(
    options?.patLookup ?? {
      data: null,
      error: { message: 'not found' },
    },
  );
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });

  const getUserMock = vi.fn().mockResolvedValue({
    data: options?.jwtUser
      ? {
          user: {
            id: options.jwtUser.id,
            role: options.jwtUser.role,
            app_metadata: options.jwtUser.appRole
              ? { role: options.jwtUser.appRole }
              : {},
          },
        }
      : { user: null },
    error: options?.jwtError ?? null,
  });

  const supabaseAdmin = {
    auth: {
      getUser: getUserMock,
    },
    from: fromMock,
  } as const;

  return {
    supabaseAdmin,
    mocks: {
      getUserMock,
      fromMock,
      selectMock,
      eqMock,
      singleMock,
    },
  };
}

function createProjectOwnershipSupabaseMock(result: {
  data: { user_id: string } | null;
  error: { message: string } | null;
}) {
  const singleMock = vi.fn().mockResolvedValue(result);
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  const fromMock = vi.fn().mockReturnValue({ select: selectMock });

  return {
    supabaseAdmin: {
      from: fromMock,
    },
    mocks: {
      fromMock,
      selectMock,
      eqMock,
      singleMock,
    },
  };
}

describe('authenticateRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installDenoEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns service role when bearer token matches service key', async () => {
    const { supabaseAdmin, mocks } = createSupabaseAdminMock();
    const req = new Request('https://edge.test/auth', {
      headers: { Authorization: 'Bearer service-role-key' },
    });

    const result = await authenticateRequest(req, supabaseAdmin as never, '[AUTH]');

    expect(result).toEqual({
      isServiceRole: true,
      userId: null,
      success: true,
    });
    expect(mocks.getUserMock).not.toHaveBeenCalled();
    expect(mocks.fromMock).not.toHaveBeenCalled();
  });

  it('verifies JWT and uses verified user id when allowJwtUserAuth is enabled', async () => {
    const { supabaseAdmin, mocks } = createSupabaseAdminMock({
      jwtUser: { id: 'user-123', role: 'authenticated' },
    });
    const req = new Request('https://edge.test/auth', {
      headers: { Authorization: 'Bearer jwt-token' },
    });

    const result = await authenticateRequest(req, supabaseAdmin as never, '[AUTH]', {
      allowJwtUserAuth: true,
    });

    expect(result).toEqual({
      isServiceRole: false,
      userId: 'user-123',
      success: true,
      isJwtAuth: true,
    });
    expect(mocks.getUserMock).toHaveBeenCalledWith('jwt-token');
    expect(mocks.fromMock).not.toHaveBeenCalled();
  });

  it('rejects service_role JWTs and falls back to PAT lookup', async () => {
    const { supabaseAdmin, mocks } = createSupabaseAdminMock({
      jwtUser: { id: 'admin-1', role: 'service_role' },
      patLookup: {
        data: null,
        error: { message: 'not found' },
      },
    });
    const req = new Request('https://edge.test/auth', {
      headers: { Authorization: 'Bearer elevated-jwt' },
    });

    const result = await authenticateRequest(req, supabaseAdmin as never, '[AUTH]', {
      allowJwtUserAuth: true,
    });

    expect(result.success).toBe(false);
    expect(result.statusCode).toBe(403);
    expect(mocks.getUserMock).toHaveBeenCalledWith('elevated-jwt');
    expect(mocks.fromMock).toHaveBeenCalled();
  });

  it('falls back to PAT lookup when JWT verification fails', async () => {
    const { supabaseAdmin, mocks } = createSupabaseAdminMock({
      jwtError: { message: 'invalid jwt' },
      patLookup: {
        data: { user_id: 'pat-user' },
        error: null,
      },
    });
    const req = new Request('https://edge.test/auth', {
      headers: { Authorization: 'Bearer pat-token' },
    });

    const result = await authenticateRequest(req, supabaseAdmin as never, '[AUTH]', {
      allowJwtUserAuth: true,
    });

    expect(result).toEqual({
      isServiceRole: false,
      userId: 'pat-user',
      success: true,
    });
    expect(mocks.getUserMock).toHaveBeenCalledWith('pat-token');
    expect(mocks.fromMock).toHaveBeenCalledWith('user_api_tokens');
  });
});

describe('verifyProjectOwnership', () => {
  it('returns success when the project belongs to the user', async () => {
    const { supabaseAdmin, mocks } = createProjectOwnershipSupabaseMock({
      data: { user_id: 'user-1' },
      error: null,
    });

    const result = await verifyProjectOwnership(
      supabaseAdmin as never,
      'project-1',
      'user-1',
      '[AUTH]',
    );

    expect(result).toEqual({
      success: true,
      projectId: 'project-1',
    });
    expect(mocks.fromMock).toHaveBeenCalledWith('projects');
  });

  it('returns not found when the project lookup fails', async () => {
    const { supabaseAdmin } = createProjectOwnershipSupabaseMock({
      data: null,
      error: { message: 'not found' },
    });

    const result = await verifyProjectOwnership(
      supabaseAdmin as never,
      'project-1',
      'user-1',
      '[AUTH]',
    );

    expect(result).toEqual({
      success: false,
      error: 'Project not found',
      statusCode: 404,
    });
  });

  it('returns forbidden when the project belongs to another user', async () => {
    const { supabaseAdmin } = createProjectOwnershipSupabaseMock({
      data: { user_id: 'owner-2' },
      error: null,
    });

    const result = await verifyProjectOwnership(
      supabaseAdmin as never,
      'project-1',
      'user-1',
      '[AUTH]',
      { forbiddenMessage: 'Forbidden: You do not own this project' },
    );

    expect(result).toEqual({
      success: false,
      error: 'Forbidden: You do not own this project',
      statusCode: 403,
    });
  });
});
