type ShotInvalidationScope = 'list' | 'detail' | 'all';

interface ShotInvalidationOptions {
  scope?: ShotInvalidationScope;
  reason: string;
  shotId?: string;
  projectId?: string;
}
