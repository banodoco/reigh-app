import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ data: [], error: null })), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })), rpc: vi.fn(), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })), auth: { getUser: vi.fn(() => ({ data: { user: { id: 'test' } } })) } } }));
import { fetchTask, extractSettings, applyModelSettings, applyPromptSettings, applyGenerationSettings } from '../applySettingsService';

describe('applySettingsService', () => {
  it('exports expected members', () => {
    expect(fetchTask).toBeDefined();
    expect(extractSettings).toBeDefined();
    expect(applyModelSettings).toBeDefined();
    expect(applyPromptSettings).toBeDefined();
    expect(applyGenerationSettings).toBeDefined();
  });
});
