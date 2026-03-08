import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null }),
  };
  return { mockSupabase };
});

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => mockSupabase,
}));

vi.mock('@/shared/lib/storageKeys', () => ({
  STORAGE_KEYS: {
    LAST_ACTIVE_SHOT_SETTINGS: (projectId: string) => `last-active-shot-settings-${projectId}`,
    LAST_ACTIVE_UI_SETTINGS: (projectId: string) => `last-active-ui-settings-${projectId}`,
    LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS: (projectId: string) => `last-active-join-segments-${projectId}`,
    GLOBAL_LAST_ACTIVE_SHOT_SETTINGS: 'global-last-active-shot-settings',
    GLOBAL_LAST_ACTIVE_JOIN_SEGMENTS_SETTINGS: 'global-last-active-join-segments',
    APPLY_PROJECT_DEFAULTS: (shotId: string) => `apply-project-defaults-${shotId}`,
    APPLY_JOIN_SEGMENTS_DEFAULTS: (shotId: string) => `apply-join-segments-defaults-${shotId}`,
  },
}));

vi.mock('@/shared/lib/toolIds', () => ({
  TOOL_IDS: {
    TRAVEL_BETWEEN_IMAGES: 'travel-between-images',
  },
}));

import { inheritSettingsForNewShot } from '../shotSettingsInheritance';

const parseJson = JSON['parse'] as (input: string) => unknown;

function parseStored<T>(value: string | null): T {
  expect(value).not.toBeNull();
  return parseJson(value as string) as T;
}

describe('inheritSettingsForNewShot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockSupabase.from.mockReturnThis();
    mockSupabase.select.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
    mockSupabase.single.mockResolvedValue({ data: null });
  });

  it('inherits from localStorage when available', async () => {
    const mainSettings = { model_name: 'local-model', steps: 30 };
    localStorage.setItem('last-active-shot-settings-project-1', JSON.stringify(mainSettings));

    await inheritSettingsForNewShot({
      newShotId: 'shot-new',
      projectId: 'project-1',
    });

    // Should have written to sessionStorage
    const stored = sessionStorage.getItem('apply-project-defaults-shot-new');
    const parsed = parseStored<Record<string, unknown>>(stored);
    expect(parsed.model_name).toBe('local-model');
    expect(parsed.prompt).toBe(''); // Prompts always cleared
    expect(parsed.pairConfigs).toEqual([]);
  });

  it('falls back to latest shot from shots array', async () => {
    const shots = [
      {
        id: 'shot-old',
        name: 'Old Shot',
        created_at: '2024-01-01T00:00:00Z',
        settings: {
          'travel-between-images': { model_name: 'old-model' },
        },
      },
      {
        id: 'shot-recent',
        name: 'Recent Shot',
        created_at: '2025-06-01T00:00:00Z',
        settings: {
          'travel-between-images': { model_name: 'recent-model' },
        },
      },
    ];

    await inheritSettingsForNewShot({
      newShotId: 'shot-new',
      projectId: 'project-1',
      shots,
    });

    const stored = sessionStorage.getItem('apply-project-defaults-shot-new');
    const parsed = parseStored<Record<string, unknown>>(stored);
    expect(parsed.model_name).toBe('recent-model');
    expect(parsed.prompt).toBe('');
  });

  it('falls back to project DB settings when nothing else available', async () => {
    mockSupabase.single.mockResolvedValue({
      data: {
        settings: {
          'travel-between-images': { model_name: 'project-model' },
        },
      },
    });

    await inheritSettingsForNewShot({
      newShotId: 'shot-new',
      projectId: 'project-1',
    });

    const stored = sessionStorage.getItem('apply-project-defaults-shot-new');
    const parsed = parseStored<Record<string, unknown>>(stored);
    expect(parsed.model_name).toBe('project-model');
  });

  it('does not write to sessionStorage when no settings found', async () => {
    mockSupabase.single.mockResolvedValue({ data: null });

    await inheritSettingsForNewShot({
      newShotId: 'shot-new',
      projectId: 'project-1',
    });

    const stored = sessionStorage.getItem('apply-project-defaults-shot-new');
    expect(stored).toBeNull();
  });

  it('uses global fallback for new projects with no shots', async () => {
    const globalSettings = { model_name: 'global-model', steps: 25 };
    localStorage.setItem('global-last-active-shot-settings', JSON.stringify(globalSettings));

    await inheritSettingsForNewShot({
      newShotId: 'shot-new',
      projectId: 'project-1',
      shots: [], // Empty = new project
    });

    const stored = sessionStorage.getItem('apply-project-defaults-shot-new');
    const parsed = parseStored<Record<string, unknown>>(stored);
    expect(parsed.model_name).toBe('global-model');
  });

  it('inherits join segments settings separately', async () => {
    const joinSettings = { contextFrameCount: 20, gapFrameCount: 30 };
    localStorage.setItem('last-active-join-segments-project-1', JSON.stringify(joinSettings));

    await inheritSettingsForNewShot({
      newShotId: 'shot-new',
      projectId: 'project-1',
    });

    const joinStored = sessionStorage.getItem('apply-join-segments-defaults-shot-new');
    const parsed = parseStored<Record<string, unknown>>(joinStored);
    expect(parsed.contextFrameCount).toBe(20);
    expect(parsed.prompt).toBe(''); // Prompts cleared
    expect(parsed.negativePrompt).toBe('');
  });
});
