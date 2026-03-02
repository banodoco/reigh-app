import { describe, it, expect, vi } from 'vitest';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn(() => ({ select: vi.fn(() => ({ data: [], error: null })), insert: vi.fn(), update: vi.fn(), delete: vi.fn() })), rpc: vi.fn(), channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })), auth: { getUser: vi.fn(() => ({ data: { user: { id: 'test' } } })) } } }));
import { extractPairPrompts, useSegmentPromptMetadata } from '../../settings/useSegmentPromptMetadata';

describe('useSegmentPromptMetadata', () => {
  it('exports expected members', () => {
    expect(extractPairPrompts).toBeDefined();
    expect(useSegmentPromptMetadata).toBeDefined();
  });

  it('useSegmentPromptMetadata is a callable function', () => {
    expect(typeof useSegmentPromptMetadata).toBe('function');
    expect(useSegmentPromptMetadata.name).toBeDefined();
  });
});
