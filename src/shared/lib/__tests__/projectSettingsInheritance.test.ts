import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must use vi.hoisted to declare mocks referenced in vi.mock factories
const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };
  return { mockSupabase };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

vi.mock('@/shared/lib/storageKeys', () => ({
  STORAGE_KEYS: {
    LAST_ACTIVE_SHOT_SETTINGS: (id: string) => `last-active-shot-settings-${id}`,
  },
}));

vi.mock('@/shared/lib/toolConstants', () => ({
  TOOL_IDS: {
    TRAVEL_BETWEEN_IMAGES: 'travel-between-images',
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import {
  fetchInheritableProjectSettings,
  buildShotSettingsForNewProject,
} from '../projectSettingsInheritance';

describe('fetchInheritableProjectSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset chain
    mockSupabase.from.mockReturnThis();
    mockSupabase.select.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
    mockSupabase.single.mockResolvedValue({ data: null });
  });

  it('returns empty object when no settings exist', async () => {
    mockSupabase.single.mockResolvedValue({ data: null });

    const result = await fetchInheritableProjectSettings('project-1');
    expect(result).toEqual({});
  });

  it('returns empty object on error', async () => {
    mockSupabase.single.mockRejectedValue(new Error('DB error'));

    const result = await fetchInheritableProjectSettings('project-1');
    expect(result).toEqual({});
  });

  it('filters out prompt-related keys', async () => {
    mockSupabase.single.mockResolvedValue({
      data: {
        settings: {
          'travel-between-images': {
            prompt: 'test prompt',
            prompts: ['p1', 'p2'],
            pairConfigs: [],
            model_name: 'test-model',
            steps: 30,
          },
        },
      },
    });

    const result = await fetchInheritableProjectSettings('project-1');
    const toolSettings = result['travel-between-images'] as Record<string, unknown>;

    expect(toolSettings).toBeDefined();
    expect(toolSettings.prompt).toBeUndefined();
    expect(toolSettings.prompts).toBeUndefined();
    expect(toolSettings.pairConfigs).toBeUndefined();
    expect(toolSettings.model_name).toBe('test-model');
    expect(toolSettings.steps).toBe(30);
  });

  it('filters out reference-related keys', async () => {
    mockSupabase.single.mockResolvedValue({
      data: {
        settings: {
          'travel-between-images': {
            references: [],
            selectedReferenceId: 'ref-1',
            styleReferenceImage: 'img.jpg',
            model_name: 'test-model',
          },
        },
      },
    });

    const result = await fetchInheritableProjectSettings('project-1');
    const toolSettings = result['travel-between-images'] as Record<string, unknown>;

    expect(toolSettings.references).toBeUndefined();
    expect(toolSettings.selectedReferenceId).toBeUndefined();
    expect(toolSettings.styleReferenceImage).toBeUndefined();
    expect(toolSettings.model_name).toBe('test-model');
  });

  it('filters keys containing prompt or reference (case-insensitive)', async () => {
    mockSupabase.single.mockResolvedValue({
      data: {
        settings: {
          'travel-between-images': {
            customPromptField: 'val',
            myReferenceData: 'val',
            validSetting: 42,
          },
        },
      },
    });

    const result = await fetchInheritableProjectSettings('project-1');
    const toolSettings = result['travel-between-images'] as Record<string, unknown>;

    expect(toolSettings.customPromptField).toBeUndefined();
    expect(toolSettings.myReferenceData).toBeUndefined();
    expect(toolSettings.validSetting).toBe(42);
  });

  it('removes empty tool settings objects', async () => {
    mockSupabase.single.mockResolvedValue({
      data: {
        settings: {
          'travel-between-images': {
            prompt: 'only prompts here',
          },
        },
      },
    });

    const result = await fetchInheritableProjectSettings('project-1');
    expect(result['travel-between-images']).toBeUndefined();
  });
});

describe('buildShotSettingsForNewProject', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockSupabase.from.mockReturnThis();
    mockSupabase.select.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
    mockSupabase.order.mockReturnThis();
    mockSupabase.limit.mockReturnThis();
    mockSupabase.single.mockResolvedValue({ data: null });
  });

  it('returns settings from localStorage when available', async () => {
    const settings = { model_name: 'test', steps: 20 };
    localStorage.setItem('last-active-shot-settings-project-1', JSON.stringify(settings));

    const result = await buildShotSettingsForNewProject('project-1', {});

    expect(result['travel-between-images']).toBeDefined();
    const toolSettings = result['travel-between-images'] as Record<string, unknown>;
    expect(toolSettings.model_name).toBe('test');
    expect(toolSettings.steps).toBe(20);
    // Prompt fields should be cleared
    expect(toolSettings.prompt).toBe('');
    expect(toolSettings.shotImageIds).toEqual([]);
  });

  it('falls back to DB when localStorage is empty', async () => {
    mockSupabase.single.mockResolvedValue({
      data: {
        settings: {
          'travel-between-images': {
            model_name: 'db-model',
            steps: 25,
          },
        },
      },
    });

    const result = await buildShotSettingsForNewProject('project-1', {});

    expect(result['travel-between-images']).toBeDefined();
    const toolSettings = result['travel-between-images'] as Record<string, unknown>;
    expect(toolSettings.model_name).toBe('db-model');
    expect(toolSettings.prompt).toBe('');
  });

  it('falls back to project-level settings as last resort', async () => {
    mockSupabase.single.mockResolvedValue({ data: null });

    const projectSettings = {
      'travel-between-images': { model_name: 'project-model' },
    };

    const result = await buildShotSettingsForNewProject('project-1', projectSettings);

    expect(result['travel-between-images']).toEqual({ model_name: 'project-model' });
  });

  it('returns empty object when no settings found anywhere', async () => {
    mockSupabase.single.mockResolvedValue({ data: null });

    const result = await buildShotSettingsForNewProject('project-1', {});
    expect(result).toEqual({});
  });
});
