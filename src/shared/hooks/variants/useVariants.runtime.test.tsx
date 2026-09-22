import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const runtimeSnapshotMock = vi.hoisted(() => vi.fn());

vi.mock('@/app/runtime/runtimeDocument', () => ({
  getRuntimeDocumentProjectId: () => 'runtime-project',
}));
vi.mock('@/integrations/runtime/generationAccess', () => ({
  fetchRuntimeGenerationSnapshot: (...args: unknown[]) => runtimeSnapshotMock(...args),
  runtimeSnapshotToDetail: (snapshot: { generation: unknown; variants: unknown[] }) => ({
    generation_id: 'generation-1',
    project_id: 'runtime-project',
    type: 'vibecomfy.run',
    starred: false,
    created_at: '2026-09-22T00:00:00.000Z',
    updated_at: '2026-09-22T00:00:00.000Z',
    variants: snapshot.variants,
  }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => {
    throw new Error('Runtime variant reads must not initialize Supabase');
  },
}));
vi.mock('@/shared/contexts/AuthContext', () => ({
  useAuthSafe: () => ({ isAuthenticated: false }),
}));

import { useVariants } from './useVariants';

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children,
  );
}

describe('useVariants Runtime authority', () => {
  it('reads Runtime variants without auth or bridge/Supabase access', async () => {
    runtimeSnapshotMock.mockResolvedValue({
      generation: { project_id: 'runtime-project' },
      variants: [{
        variant_id: 'variant-1',
        generation_id: 'generation-1',
        object_id: 'sha256:' + 'a'.repeat(64),
        variant_type: 'original',
        metadata: { is_primary: true, media_type: 'image/png' },
        created_at: '2026-09-22T00:00:00.000Z',
      }],
    });

    const { result } = renderHook(
      () => useVariants({ generationId: 'generation-1' }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.variants).toHaveLength(1));
    expect(runtimeSnapshotMock).toHaveBeenCalledWith('generation-1', expect.any(Object));
    expect(result.current.variants[0].location).toContain('/api/runtime/');
  });
});
