import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authenticateRequest,
  getTaskUserId,
  verifyShotOwnership,
  verifyTaskOwnership,
} from '../../supabase/functions/_shared/auth';

type SingleResponse = { data: unknown; error: unknown };

function createSupabaseAdminMock(responses: Record<string, SingleResponse>) {
  return {
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        single: async () => responses[table] ?? { data: null, error: { message: 'not found' } },
      };
    },
  };
}

describe('supabase auth shared helpers', () => {
  beforeEach(() => {
    (globalThis as unknown as { Deno: { env: { get: (key: string) => string | undefined } } }).Deno = {
      env: {
        get: (key: string) => (key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service-role-secret' : undefined),
      },
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('authenticates service-role bearer tokens', async () => {
    const req = new Request('https://example.com', {
      headers: { Authorization: 'Bearer service-role-secret' },
    });
    const result = await authenticateRequest(req, createSupabaseAdminMock({}));

    expect(result).toEqual({
      isServiceRole: true,
      userId: null,
      success: true,
    });
  });

  it('authenticates PAT bearer tokens through user_api_tokens', async () => {
    const req = new Request('https://example.com', {
      headers: { Authorization: 'Bearer pat-token' },
    });
    const supabaseAdmin = createSupabaseAdminMock({
      user_api_tokens: { data: { user_id: 'user-123' }, error: null },
    });

    const result = await authenticateRequest(req, supabaseAdmin, '[AUTH]', { allowJwtUserAuth: false });

    expect(result.success).toBe(true);
    expect(result.isServiceRole).toBe(false);
    expect(result.userId).toBe('user-123');
  });

  it('authenticates JWT user tokens when enabled', async () => {
    const payload = btoa(JSON.stringify({ sub: 'jwt-user', role: 'authenticated' }))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    const token = `header.${payload}.signature`;
    const req = new Request('https://example.com', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const result = await authenticateRequest(req, createSupabaseAdminMock({}), '[AUTH]', {
      allowJwtUserAuth: true,
    });

    expect(result.success).toBe(true);
    expect(result.userId).toBe('jwt-user');
    expect(result.isJwtAuth).toBe(true);
  });

  it('verifies task and shot ownership through project ownership', async () => {
    const ownerId = 'owner-1';
    const taskAuth = await verifyTaskOwnership(
      createSupabaseAdminMock({
        tasks: { data: { project_id: 'project-1' }, error: null },
        projects: { data: { user_id: ownerId }, error: null },
      }),
      'task-1',
      ownerId,
    );
    const shotAuth = await verifyShotOwnership(
      createSupabaseAdminMock({
        shots: { data: { project_id: 'project-1' }, error: null },
        projects: { data: { user_id: ownerId }, error: null },
      }),
      'shot-1',
      ownerId,
    );

    expect(taskAuth.success).toBe(true);
    expect(taskAuth.projectId).toBe('project-1');
    expect(shotAuth.success).toBe(true);
    expect(shotAuth.projectId).toBe('project-1');
  });

  it('falls back to system user when project lookup fails', async () => {
    const result = await getTaskUserId(
      createSupabaseAdminMock({
        tasks: { data: { project_id: 'project-1' }, error: null },
        projects: { data: null, error: { message: 'project lookup failed' } },
      }),
      'task-1',
    );

    expect(result.userId).toBe('system');
  });
});
