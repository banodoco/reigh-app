import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';

function buildAuthError(message: string, context: string, cause?: unknown): Error {
  return new Error(`${context}: ${message}`, cause ? { cause } : undefined);
}

export async function requireSession(
  client: SupabaseClient<Database>,
  context = 'auth',
): Promise<Session> {
  const { data, error } = await client.auth.getSession();
  if (error) {
    throw buildAuthError('Failed to get session', context, error);
  }
  if (!data.session) {
    throw buildAuthError('Not authenticated', context);
  }
  return data.session;
}

export async function requireUserFromSession(
  client: SupabaseClient<Database>,
  context = 'auth',
): Promise<User> {
  const session = await requireSession(client, context);
  if (!session.user) {
    throw buildAuthError('Authenticated session has no user', context);
  }
  return session.user;
}
