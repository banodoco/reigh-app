import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockNot = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: () => ({
      insert: (...args: unknown[]) => {
        mockInsert(...args);
        return {
          select: (...selectArgs: unknown[]) => {
            mockSelect(...selectArgs);
            return {
              single: (...singleArgs: unknown[]) => {
                mockSingle(...singleArgs);
                return mockSingle();
              },
            };
          },
        };
      },
      select: () => ({
        eq: (...eqArgs: unknown[]) => {
          mockEq(...eqArgs);
          return {
            not: (...notArgs: unknown[]) => {
              mockNot(...notArgs);
              return mockNot();
            },
          };
        },
      }),
    }),
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}));

vi.mock('@/shared/constants/supabaseErrors', () => ({
  isNotFoundError: () => false,
}));

vi.mock('@/shared/lib/timelinePositionCalculator', () => ({
  ensureUniqueFrame: vi.fn().mockImplementation((frame: number) => frame),
}));

vi.mock('../shotMutationHelpers', () => ({
  isQuotaOrServerError: vi.fn().mockReturnValue(false),
}));

import {
  withVariableMetadata,
  runAddImageMutation,
  toAddImageErrorMessage,
  type AddImageToShotVariables,
} from '../addImageToShotHelpers';
import { isQuotaOrServerError } from '../shotMutationHelpers';
import { ensureUniqueFrame } from '@/shared/lib/timelinePositionCalculator';

function makeVariables(overrides: Partial<AddImageToShotVariables> = {}): AddImageToShotVariables {
  return {
    shot_id: 'shot-1',
    generation_id: 'gen-new',
    project_id: 'project-1',
    imageUrl: 'https://example.com/new.png',
    thumbUrl: 'https://example.com/new-thumb.png',
    ...overrides,
  };
}

describe('addImageToShotHelpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ensureUniqueFrame).mockImplementation((frame: number) => frame);
  });

  describe('withVariableMetadata', () => {
    it('merges project_id, imageUrl, and thumbUrl onto the data object', () => {
      const data = { id: 'sg-1', generation_id: 'gen-1' };
      const variables = makeVariables();
      const result = withVariableMetadata(data, variables);

      expect(result).toEqual({
        id: 'sg-1',
        generation_id: 'gen-1',
        project_id: 'project-1',
        imageUrl: 'https://example.com/new.png',
        thumbUrl: 'https://example.com/new-thumb.png',
      });
    });

    it('preserves existing properties on the data object', () => {
      const data = { id: 'sg-1', timeline_frame: 50, extra: true };
      const variables = makeVariables();
      const result = withVariableMetadata(data, variables);

      expect(result.id).toBe('sg-1');
      expect(result.timeline_frame).toBe(50);
      expect(result.extra).toBe(true);
      expect(result.project_id).toBe('project-1');
    });

    it('handles undefined imageUrl and thumbUrl', () => {
      const result = withVariableMetadata(
        { id: 'sg-1' },
        makeVariables({ imageUrl: undefined, thumbUrl: undefined }),
      );

      expect(result.imageUrl).toBeUndefined();
      expect(result.thumbUrl).toBeUndefined();
      expect(result.project_id).toBe('project-1');
    });

    it('overrides data properties with the same name', () => {
      const result = withVariableMetadata(
        { id: 'sg-1', project_id: 'old-project' },
        makeVariables({ project_id: 'new-project' }),
      );

      expect(result.project_id).toBe('new-project');
    });
  });

  describe('runAddImageMutation', () => {
    it('calls insertUnpositionedShotGeneration when timelineFrame is null', async () => {
      const insertResult = { id: 'sg-new', generation_id: 'gen-new', timeline_frame: null };
      mockSingle.mockResolvedValue({ data: insertResult, error: null });

      const result = await runAddImageMutation(makeVariables({ timelineFrame: null }));

      expect(mockInsert).toHaveBeenCalledWith({
        shot_id: 'shot-1',
        generation_id: 'gen-new',
        timeline_frame: null,
      });
      expect(result).toEqual(insertResult);
    });

    it('calls insertAutoPositionedShotGeneration when timelineFrame is undefined', async () => {
      const rpcResult = { id: 'sg-new', generation_id: 'gen-new', timeline_frame: 100 };
      mockRpc.mockResolvedValue({ data: rpcResult, error: null });

      const result = await runAddImageMutation(makeVariables({ timelineFrame: undefined }));

      expect(mockRpc).toHaveBeenCalledWith('add_generation_to_shot', {
        p_shot_id: 'shot-1',
        p_generation_id: 'gen-new',
        p_with_position: true,
      });
      expect(result).toEqual(rpcResult);
    });

    it('calls insertExplicitlyPositionedShotGeneration when timelineFrame is a number', async () => {
      mockNot.mockResolvedValue({ data: [{ timeline_frame: 0 }, { timeline_frame: 50 }], error: null });
      const insertResult = { id: 'sg-new', generation_id: 'gen-new', timeline_frame: 75 };
      mockSingle.mockResolvedValue({ data: insertResult, error: null });

      const result = await runAddImageMutation(makeVariables({ timelineFrame: 75 }));

      expect(ensureUniqueFrame).toHaveBeenCalledWith(75, [0, 50]);
      expect(mockInsert).toHaveBeenCalledWith({
        shot_id: 'shot-1',
        generation_id: 'gen-new',
        timeline_frame: 75,
      });
      expect(result).toEqual(insertResult);
    });

    it('throws when unpositioned insert fails', async () => {
      mockSingle.mockResolvedValue({ data: null, error: new Error('DB error') });

      await expect(runAddImageMutation(makeVariables({ timelineFrame: null }))).rejects.toThrow('DB error');
    });

    it('throws when RPC call fails', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('RPC failed') });

      await expect(runAddImageMutation(makeVariables({ timelineFrame: undefined }))).rejects.toThrow('RPC failed');
    });

    it('handles RPC returning an array', async () => {
      const rpcResult = [{ id: 'sg-new', generation_id: 'gen-new', timeline_frame: 100 }];
      mockRpc.mockResolvedValue({ data: rpcResult, error: null });

      const result = await runAddImageMutation(makeVariables({ timelineFrame: undefined }));

      expect(result).toEqual(rpcResult[0]);
    });

    it('returns empty object when RPC returns null result', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      const result = await runAddImageMutation(makeVariables({ timelineFrame: undefined }));

      expect(result).toEqual({});
    });

    it('filters out null and -1 frames when resolving explicit position', async () => {
      mockNot.mockResolvedValue({
        data: [
          { timeline_frame: 0 },
          { timeline_frame: null },
          { timeline_frame: -1 },
          { timeline_frame: 50 },
        ],
        error: null,
      });
      mockSingle.mockResolvedValue({ data: { id: 'sg-new', timeline_frame: 75 }, error: null });

      await runAddImageMutation(makeVariables({ timelineFrame: 75 }));

      expect(ensureUniqueFrame).toHaveBeenCalledWith(75, [0, 50]);
    });
  });

  describe('toAddImageErrorMessage', () => {
    it('returns network message for "Load failed" errors', () => {
      expect(toAddImageErrorMessage(new Error('Load failed'))).toContain('Network connection');
    });

    it('returns network message for "TypeError" errors', () => {
      expect(toAddImageErrorMessage(new Error('TypeError: Failed to fetch'))).toContain('Network connection');
    });

    it('returns server connection message for "fetch" errors', () => {
      expect(toAddImageErrorMessage(new Error('fetch error'))).toContain('Unable to connect');
    });

    it('returns server busy message for quota/server errors', () => {
      vi.mocked(isQuotaOrServerError).mockReturnValueOnce(true);

      expect(toAddImageErrorMessage(new Error('503 Service Unavailable'))).toContain('Server is temporarily busy');
    });

    it('returns the raw error message for unrecognized errors', () => {
      expect(toAddImageErrorMessage(new Error('Some unique error'))).toBe('Some unique error');
    });

    it('prioritizes "Load failed" over "fetch" in the message', () => {
      expect(toAddImageErrorMessage(new Error('Load failed during fetch'))).toContain('Network connection');
    });
  });
});
