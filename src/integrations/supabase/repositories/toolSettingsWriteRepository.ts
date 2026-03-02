import { getSupabaseClient } from '@/integrations/supabase/client';

export type SettingsScopeIdentifier = 'user' | 'project' | 'shot';
export type SettingsScopeTableName = 'users' | 'projects' | 'shots';

export function resolveSettingsScopeTable(scope: SettingsScopeIdentifier): SettingsScopeTableName {
  switch (scope) {
    case 'user':
      return 'users';
    case 'project':
      return 'projects';
    case 'shot':
      return 'shots';
  }

  throw new Error(`Invalid settings scope: ${String(scope)}`);
}

export function selectSettingsForScope(scope: SettingsScopeIdentifier, id: string) {
  const tableName = resolveSettingsScopeTable(scope);
  return getSupabaseClient()
    .from(tableName)
    .select('settings')
    .eq('id', id)
    .single();
}

export function callUpdateToolSettingsAtomicRpc(
  tableName: SettingsScopeTableName,
  id: string,
  toolId: string,
  settings: Record<string, unknown>,
) {
  return getSupabaseClient().rpc('update_tool_settings_atomic', {
    p_table_name: tableName,
    p_id: id,
    p_tool_id: toolId,
    p_settings: settings,
  });
}
