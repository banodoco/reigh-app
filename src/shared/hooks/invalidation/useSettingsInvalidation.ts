type SettingsInvalidationScope = 'tool' | 'segment' | 'user' | 'pair' | 'all';

interface SettingsInvalidationOptions {
  scope: SettingsInvalidationScope;
  reason: string;
  toolId?: string;
  projectId?: string;
  shotId?: string;
  pairId?: string;
}
