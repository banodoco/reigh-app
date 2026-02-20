export type SettingsInvalidationScope = 'tool' | 'segment' | 'user' | 'pair' | 'all';

export interface SettingsInvalidationOptions {
  scope: SettingsInvalidationScope;
  reason: string;
  toolId?: string;
  projectId?: string;
  shotId?: string;
  pairId?: string;
}
