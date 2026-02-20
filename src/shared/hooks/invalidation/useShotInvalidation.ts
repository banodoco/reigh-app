export type ShotInvalidationScope = 'list' | 'detail' | 'all';

export interface ShotInvalidationOptions {
  scope?: ShotInvalidationScope;
  reason: string;
  shotId?: string;
  projectId?: string;
}
