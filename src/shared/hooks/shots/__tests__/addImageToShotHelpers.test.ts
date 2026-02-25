import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { GenerationRow } from '@/domains/generation/types';
import type { Shot } from '@/domains/generation/types';
import { queryKeys } from '@/shared/lib/queryKeys';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockNot = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: (...a: unknown[]) => {
        mockInsert(...a);
        return {
          select: (...b: unknown[]) => {
            mockSelect(...b);
            return { single: (...c: unknown[]) => { mockSingle(...c); return mockSingle(); } };
          },
        };
      },
      select: () => ({
        eq: (...a: unknown[]) => {
          mockEq(...a);
          return {
            not: (...b: unknown[]) => {
              mockNot(...b);
              return mockNot();
            },
          };
        },
      }),
    }),
    rpc: (...a: unknown[]) => mockRpc(...a),
  },
}));

vi.mock('@/shared/constants/supabaseErrors', () => ({
  isNotFoundError: () => false,
}));

vi.mock('@/shared/lib/timelinePositionCalculator', () => ({
  calculateNextAvailableFrame: vi.fn().mockReturnValue(100),
  ensureUniqueFrame: vi.fn().mockImplementation((frame: number) => frame),
}));

const mockUpdateAllShotsCaches = vi.fn();
vi.mock('../cacheUtils', () => ({
  updateAllShotsCaches: (...args: unknown[]) => mockUpdateAllShotsCaches(...args),
}));

vi.mock('../shotMutationHelpers', () => ({
  isQuotaOrServerError: vi.fn().mockReturnValue(false),
}));

// Import after mocks are set up
import {
  withVariableMetadata,
  runAddImageMutation,
  applyOptimisticCaches,
  toAddImageErrorMessage,
  replaceOptimisticItemInCache,
  replaceOptimisticItemInShotsCache,
  type AddImageToShotVariables,
} from '../addImageToShotHelpers';
import { isQuotaOrServerError } from '../shotMutationHelpers';
import { calculateNextAvailableFrame, ensureUniqueFrame } from '@/shared/lib/timelinePositionCalculator';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function createGenerationRow(id: string, frame: number | null = 0, overrides: Partial<GenerationRow> = {}): GenerationRow {
  return {
    id,
    generation_id: `gen-${id}`,
    timeline_frame: frame,
    location: `https://example.com/${id}.png`,
    ...overrides,
  } as GenerationRow;
}

function createShot(id: string, images: GenerationRow[] = []): Shot {
  return {
    id,
    name: `Shot ${id}`,
    images,
    project_id: 'project-1',
  } as Shot;
}

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('addImageToShotHelpers', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createQueryClient();
    // Reset the mock implementations to defaults
    vi.mocked(ensureUniqueFrame).mockImplementation((frame: number) => frame);
    vi.mocked(calculateNextAvailableFrame).mockReturnValue(100);
  });

  // ========================================================================
  // withVariableMetadata
  // ========================================================================

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
      const data = { id: 'sg-1' };
      const variables = makeVariables({ imageUrl: undefined, thumbUrl: undefined });
      const result = withVariableMetadata(data, variables);

      expect(result.imageUrl).toBeUndefined();
      expect(result.thumbUrl).toBeUndefined();
      expect(result.project_id).toBe('project-1');
    });

    it('overrides data properties with the same name', () => {
      const data = { id: 'sg-1', project_id: 'old-project' };
      const variables = makeVariables({ project_id: 'new-project' });
      const result = withVariableMetadata(data, variables);

      expect(result.project_id).toBe('new-project');
    });
  });

  // ========================================================================
  // runAddImageMutation
  // ========================================================================

  describe('runAddImageMutation', () => {
    it('calls insertUnpositionedShotGeneration when timelineFrame is null', async () => {
      const insertResult = { id: 'sg-new', generation_id: 'gen-new', timeline_frame: null };
      mockSingle.mockResolvedValue({ data: insertResult, error: null });

      const variables = makeVariables({ timelineFrame: null });
      const result = await runAddImageMutation(variables);

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

      const variables = makeVariables({ timelineFrame: undefined });
      const result = await runAddImageMutation(variables);

      expect(mockRpc).toHaveBeenCalledWith('add_generation_to_shot', {
        p_shot_id: 'shot-1',
        p_generation_id: 'gen-new',
        p_with_position: true,
      });
      expect(result).toEqual(rpcResult);
    });

    it('calls insertExplicitlyPositionedShotGeneration when timelineFrame is a number', async () => {
      // Mock the fetchResolvedTimelineFrame supabase query
      mockNot.mockResolvedValue({ data: [{ timeline_frame: 0 }, { timeline_frame: 50 }], error: null });

      const insertResult = { id: 'sg-new', generation_id: 'gen-new', timeline_frame: 75 };
      mockSingle.mockResolvedValue({ data: insertResult, error: null });

      const variables = makeVariables({ timelineFrame: 75 });
      const result = await runAddImageMutation(variables);

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

      const variables = makeVariables({ timelineFrame: null });
      await expect(runAddImageMutation(variables)).rejects.toThrow('DB error');
    });

    it('throws when RPC call fails', async () => {
      mockRpc.mockResolvedValue({ data: null, error: new Error('RPC failed') });

      const variables = makeVariables({ timelineFrame: undefined });
      await expect(runAddImageMutation(variables)).rejects.toThrow('RPC failed');
    });

    it('handles RPC returning an array', async () => {
      const rpcResult = [{ id: 'sg-new', generation_id: 'gen-new', timeline_frame: 100 }];
      mockRpc.mockResolvedValue({ data: rpcResult, error: null });

      const variables = makeVariables({ timelineFrame: undefined });
      const result = await runAddImageMutation(variables);

      expect(result).toEqual(rpcResult[0]);
    });

    it('returns empty object when RPC returns null result', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      const variables = makeVariables({ timelineFrame: undefined });
      const result = await runAddImageMutation(variables);

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

      const insertResult = { id: 'sg-new', timeline_frame: 75 };
      mockSingle.mockResolvedValue({ data: insertResult, error: null });

      const variables = makeVariables({ timelineFrame: 75 });
      await runAddImageMutation(variables);

      // ensureUniqueFrame should only receive valid frames (0 and 50)
      expect(ensureUniqueFrame).toHaveBeenCalledWith(75, [0, 50]);
    });
  });

  // ========================================================================
  // applyOptimisticCaches
  // ========================================================================

  describe('applyOptimisticCaches', () => {
    it('appends optimistic item to shot-generations cache', () => {
      const existing = [createGenerationRow('sg-1', 0)];
      const variables = makeVariables();

      applyOptimisticCaches(queryClient, variables, existing, 'temp-id-1');

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect(cached).toHaveLength(2);
      expect(cached![0].id).toBe('sg-1');
      expect(cached![1].id).toBe('temp-id-1');
    });

    it('creates optimistic item with correct identity fields', () => {
      const existing: GenerationRow[] = [];
      const variables = makeVariables({ generation_id: 'gen-42' });

      applyOptimisticCaches(queryClient, variables, existing, 'temp-id-1');

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      const item = cached![0];
      expect(item.id).toBe('temp-id-1');
      expect(item.generation_id).toBe('gen-42');
      expect(item.shotImageEntryId).toBe('temp-id-1');
      expect(item.shot_generation_id).toBe('temp-id-1');
    });

    it('sets _optimistic flag to true', () => {
      applyOptimisticCaches(queryClient, makeVariables(), [], 'temp-id-1');

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect((cached![0] as Record<string, unknown>)._optimistic).toBe(true);
    });

    it('uses imageUrl as location and thumbnail fallback', () => {
      const variables = makeVariables({
        imageUrl: 'https://example.com/img.png',
        thumbUrl: undefined,
      });

      applyOptimisticCaches(queryClient, variables, [], 'temp-id-1');

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      const item = cached![0] as Record<string, unknown>;
      expect(item.location).toBe('https://example.com/img.png');
      expect(item.thumbnail_url).toBe('https://example.com/img.png');
      expect(item.thumbUrl).toBe('https://example.com/img.png');
    });

    it('uses thumbUrl when provided', () => {
      const variables = makeVariables({
        imageUrl: 'https://example.com/img.png',
        thumbUrl: 'https://example.com/thumb.png',
      });

      applyOptimisticCaches(queryClient, variables, [], 'temp-id-1');

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      const item = cached![0] as Record<string, unknown>;
      expect(item.thumbnail_url).toBe('https://example.com/thumb.png');
      expect(item.thumbUrl).toBe('https://example.com/thumb.png');
    });

    it('skips shot-generations cache update when previousFastGens is undefined', () => {
      applyOptimisticCaches(queryClient, makeVariables(), undefined, 'temp-id-1');

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect(cached).toBeUndefined();
    });

    it('calls updateAllShotsCaches to update shots cache', () => {
      applyOptimisticCaches(queryClient, makeVariables(), [], 'temp-id-1');

      expect(mockUpdateAllShotsCaches).toHaveBeenCalledWith(
        queryClient,
        'project-1',
        expect.any(Function),
      );
    });

    it('shots cache updater appends item to matching shot images', () => {
      const existingShot = createShot('shot-1', [createGenerationRow('sg-1', 0)]);
      const otherShot = createShot('shot-2', [createGenerationRow('sg-2', 10)]);

      // Capture the updater function
      applyOptimisticCaches(queryClient, makeVariables(), [], 'temp-id-1');

      const updaterFn = mockUpdateAllShotsCaches.mock.calls[0][2];
      const result = updaterFn([existingShot, otherShot]);

      // Matching shot should have the new image appended
      expect(result[0].images).toHaveLength(2);
      expect(result[0].images![1].id).toBe('temp-id-1');

      // Non-matching shot should be unchanged
      expect(result[1].images).toHaveLength(1);
      expect(result[1]).toBe(otherShot);
    });

    it('shots cache updater handles shot with no images array', () => {
      const shotNoImages = { id: 'shot-1', name: 'Shot 1' } as Shot;

      applyOptimisticCaches(queryClient, makeVariables(), [], 'temp-id-1');

      const updaterFn = mockUpdateAllShotsCaches.mock.calls[0][2];
      const result = updaterFn([shotNoImages]);

      expect(result[0].images).toHaveLength(1);
      expect(result[0].images![0].id).toBe('temp-id-1');
    });

    it('shots cache updater handles undefined shots array', () => {
      applyOptimisticCaches(queryClient, makeVariables(), [], 'temp-id-1');

      const updaterFn = mockUpdateAllShotsCaches.mock.calls[0][2];
      const result = updaterFn(undefined);

      expect(result).toEqual([]);
    });

    it('sets timeline_frame to null when timelineFrame variable is null', () => {
      const variables = makeVariables({ timelineFrame: null });

      applyOptimisticCaches(queryClient, variables, [], 'temp-id-1');

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect(cached![0].timeline_frame).toBeNull();
    });

    it('calculates next available frame when timelineFrame is undefined', () => {
      const existing = [
        createGenerationRow('sg-1', 0),
        createGenerationRow('sg-2', 50),
      ];
      const variables = makeVariables({ timelineFrame: undefined });

      applyOptimisticCaches(queryClient, variables, existing, 'temp-id-1');

      expect(calculateNextAvailableFrame).toHaveBeenCalledWith([0, 50]);
      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect(cached![2].timeline_frame).toBe(100); // mocked return value
    });

    it('uses ensureUniqueFrame when timelineFrame is an explicit number', () => {
      const existing = [createGenerationRow('sg-1', 0)];
      const variables = makeVariables({ timelineFrame: 75 });

      applyOptimisticCaches(queryClient, variables, existing, 'temp-id-1');

      expect(ensureUniqueFrame).toHaveBeenCalledWith(75, [0]);
    });

    it('filters out null and -1 frames when calculating optimistic position', () => {
      const existing = [
        createGenerationRow('sg-1', 0),
        createGenerationRow('sg-2', null),
        createGenerationRow('sg-3', -1),
        createGenerationRow('sg-4', 50),
      ];
      const variables = makeVariables({ timelineFrame: undefined });

      applyOptimisticCaches(queryClient, variables, existing, 'temp-id-1');

      // calculateNextAvailableFrame should only receive valid frames
      expect(calculateNextAvailableFrame).toHaveBeenCalledWith([0, 50]);
    });

    it('populates shot_data with the resolved frame for the given shot', () => {
      const variables = makeVariables({ timelineFrame: 75 });

      applyOptimisticCaches(queryClient, variables, [], 'temp-id-1');

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      const item = cached![0] as Record<string, unknown>;
      expect(item.shot_data).toEqual({ 'shot-1': [75] });
    });

    it('sets shot_data to empty object when frame is null', () => {
      const variables = makeVariables({ timelineFrame: null });

      applyOptimisticCaches(queryClient, variables, [], 'temp-id-1');

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      const item = cached![0] as Record<string, unknown>;
      expect(item.shot_data).toEqual({});
    });

    it('sets default metadata fields on optimistic item', () => {
      applyOptimisticCaches(queryClient, makeVariables(), [], 'temp-id-1');

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      const item = cached![0] as Record<string, unknown>;
      expect(item.type).toBe('image');
      expect(item.starred).toBe(false);
      expect(item.name).toBeNull();
      expect(item.based_on).toBeNull();
      expect(item.params).toEqual({});
      expect(item.created_at).toBeDefined();
    });
  });

  // ========================================================================
  // toAddImageErrorMessage
  // ========================================================================

  describe('toAddImageErrorMessage', () => {
    it('returns network message for "Load failed" errors', () => {
      const result = toAddImageErrorMessage(new Error('Load failed'));
      expect(result).toContain('Network connection');
    });

    it('returns network message for "TypeError" errors', () => {
      const result = toAddImageErrorMessage(new Error('TypeError: Failed to fetch'));
      expect(result).toContain('Network connection');
    });

    it('returns server connection message for "fetch" errors', () => {
      const result = toAddImageErrorMessage(new Error('fetch error'));
      expect(result).toContain('Unable to connect');
    });

    it('returns server busy message for quota/server errors', () => {
      vi.mocked(isQuotaOrServerError).mockReturnValueOnce(true);
      const result = toAddImageErrorMessage(new Error('503 Service Unavailable'));
      expect(result).toContain('Server is temporarily busy');
    });

    it('returns the raw error message for unrecognized errors', () => {
      const result = toAddImageErrorMessage(new Error('Some unique error'));
      expect(result).toBe('Some unique error');
    });

    it('prioritizes "Load failed" over "fetch" in the message', () => {
      // "Load failed" check comes first in the code
      const result = toAddImageErrorMessage(new Error('Load failed during fetch'));
      expect(result).toContain('Network connection');
    });
  });

  // ========================================================================
  // replaceOptimisticItemInCache
  // ========================================================================

  describe('replaceOptimisticItemInCache', () => {
    it('replaces the temp item with real server data', () => {
      const optimistic = {
        ...createGenerationRow('temp-id-1', 100),
        _optimistic: true,
      } as GenerationRow;
      queryClient.setQueryData(queryKeys.generations.byShot('shot-1'), [optimistic]);

      const serverData = {
        id: 'sg-real',
        generation_id: 'gen-new',
        timeline_frame: 100,
      };

      replaceOptimisticItemInCache(queryClient, 'shot-1', 'temp-id-1', serverData);

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect(cached).toHaveLength(1);
      expect(cached![0].id).toBe('sg-real');
      expect(cached![0].generation_id).toBe('gen-new');
      expect(cached![0].shotImageEntryId).toBe('sg-real');
      expect(cached![0].shot_generation_id).toBe('sg-real');
    });

    it('clears the _optimistic flag', () => {
      const optimistic = {
        ...createGenerationRow('temp-id-1', 100),
        _optimistic: true,
      } as GenerationRow;
      queryClient.setQueryData(queryKeys.generations.byShot('shot-1'), [optimistic]);

      replaceOptimisticItemInCache(queryClient, 'shot-1', 'temp-id-1', {
        id: 'sg-real',
        generation_id: 'gen-new',
        timeline_frame: 100,
      });

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect((cached![0] as Record<string, unknown>)._optimistic).toBeUndefined();
    });

    it('updates timeline_frame from server data', () => {
      const optimistic = createGenerationRow('temp-id-1', 100) as GenerationRow;
      queryClient.setQueryData(queryKeys.generations.byShot('shot-1'), [optimistic]);

      replaceOptimisticItemInCache(queryClient, 'shot-1', 'temp-id-1', {
        id: 'sg-real',
        generation_id: 'gen-new',
        timeline_frame: 75, // server resolved to different frame
      });

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect(cached![0].timeline_frame).toBe(75);
    });

    it('does not modify other items in the cache', () => {
      const existing = createGenerationRow('sg-existing', 0);
      const optimistic = createGenerationRow('temp-id-1', 100);
      queryClient.setQueryData(queryKeys.generations.byShot('shot-1'), [existing, optimistic]);

      replaceOptimisticItemInCache(queryClient, 'shot-1', 'temp-id-1', {
        id: 'sg-real',
        generation_id: 'gen-new',
        timeline_frame: 100,
      });

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect(cached).toHaveLength(2);
      expect(cached![0]).toBe(existing); // reference equality - untouched
      expect(cached![1].id).toBe('sg-real');
    });

    it('returns undefined when cache is empty', () => {
      replaceOptimisticItemInCache(queryClient, 'shot-1', 'temp-id-1', {
        id: 'sg-real',
        generation_id: 'gen-new',
        timeline_frame: 100,
      });

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect(cached).toBeUndefined();
    });

    it('leaves cache unchanged when tempId is not found', () => {
      const existing = createGenerationRow('sg-existing', 0);
      queryClient.setQueryData(queryKeys.generations.byShot('shot-1'), [existing]);

      replaceOptimisticItemInCache(queryClient, 'shot-1', 'nonexistent-temp', {
        id: 'sg-real',
        generation_id: 'gen-new',
        timeline_frame: 100,
      });

      const cached = queryClient.getQueryData<GenerationRow[]>(
        queryKeys.generations.byShot('shot-1'),
      );
      expect(cached).toHaveLength(1);
      expect(cached![0]).toBe(existing);
    });
  });

  // ========================================================================
  // replaceOptimisticItemInShotsCache
  // ========================================================================

  describe('replaceOptimisticItemInShotsCache', () => {
    it('replaces the optimistic item in the matching shot images', () => {
      const optimistic = {
        ...createGenerationRow('temp-id-1', 100),
        _optimistic: true,
      } as GenerationRow;
      const shot = createShot('shot-1', [optimistic]);

      replaceOptimisticItemInShotsCache(
        queryClient,
        'project-1',
        'shot-1',
        'temp-id-1',
        { id: 'sg-real', generation_id: 'gen-new', timeline_frame: 100 },
      );

      // Verify updateAllShotsCaches was called
      expect(mockUpdateAllShotsCaches).toHaveBeenCalledWith(
        queryClient,
        'project-1',
        expect.any(Function),
      );

      // Execute the updater to verify behavior
      const updaterFn = mockUpdateAllShotsCaches.mock.calls[0][2];
      const result = updaterFn([shot]);

      expect(result[0].images).toHaveLength(1);
      expect(result[0].images![0].id).toBe('sg-real');
      expect(result[0].images![0].generation_id).toBe('gen-new');
      expect(result[0].images![0].shotImageEntryId).toBe('sg-real');
      expect((result[0].images![0] as Record<string, unknown>)._optimistic).toBeUndefined();
    });

    it('does not modify shots that do not match the shotId', () => {
      const optimistic = createGenerationRow('temp-id-1', 100) as GenerationRow;
      const matchingShot = createShot('shot-1', [optimistic]);
      const otherShot = createShot('shot-2', [createGenerationRow('sg-other', 0)]);

      replaceOptimisticItemInShotsCache(
        queryClient,
        'project-1',
        'shot-1',
        'temp-id-1',
        { id: 'sg-real', generation_id: 'gen-new', timeline_frame: 100 },
      );

      const updaterFn = mockUpdateAllShotsCaches.mock.calls[0][2];
      const result = updaterFn([matchingShot, otherShot]);

      expect(result[1]).toBe(otherShot); // reference equality
    });

    it('handles shot with no images gracefully', () => {
      const shotNoImages = { id: 'shot-1', name: 'Shot 1' } as Shot;

      replaceOptimisticItemInShotsCache(
        queryClient,
        'project-1',
        'shot-1',
        'temp-id-1',
        { id: 'sg-real', generation_id: 'gen-new', timeline_frame: 100 },
      );

      const updaterFn = mockUpdateAllShotsCaches.mock.calls[0][2];
      const result = updaterFn([shotNoImages]);

      // Shot without images should be returned as-is
      expect(result[0]).toBe(shotNoImages);
    });

    it('handles undefined shots array', () => {
      replaceOptimisticItemInShotsCache(
        queryClient,
        'project-1',
        'shot-1',
        'temp-id-1',
        { id: 'sg-real', generation_id: 'gen-new', timeline_frame: 100 },
      );

      const updaterFn = mockUpdateAllShotsCaches.mock.calls[0][2];
      const result = updaterFn(undefined);

      expect(result).toEqual([]);
    });

    it('does not modify images that do not match the tempId', () => {
      const existingImage = createGenerationRow('sg-existing', 0);
      const optimistic = createGenerationRow('temp-id-1', 100);
      const shot = createShot('shot-1', [existingImage, optimistic]);

      replaceOptimisticItemInShotsCache(
        queryClient,
        'project-1',
        'shot-1',
        'temp-id-1',
        { id: 'sg-real', generation_id: 'gen-new', timeline_frame: 100 },
      );

      const updaterFn = mockUpdateAllShotsCaches.mock.calls[0][2];
      const result = updaterFn([shot]);

      expect(result[0].images).toHaveLength(2);
      expect(result[0].images![0]).toBe(existingImage); // reference equality
      expect(result[0].images![1].id).toBe('sg-real');
    });

    it('updates timeline_frame from server data', () => {
      const optimistic = createGenerationRow('temp-id-1', 100);
      const shot = createShot('shot-1', [optimistic]);

      replaceOptimisticItemInShotsCache(
        queryClient,
        'project-1',
        'shot-1',
        'temp-id-1',
        { id: 'sg-real', generation_id: 'gen-new', timeline_frame: 42 },
      );

      const updaterFn = mockUpdateAllShotsCaches.mock.calls[0][2];
      const result = updaterFn([shot]);

      expect(result[0].images![0].timeline_frame).toBe(42);
    });
  });
});
