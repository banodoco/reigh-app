import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the useTaskType module which provides the database cache
vi.mock('@/shared/hooks/useTaskType', () => ({
  isTaskTypeConfigCacheInitialized: vi.fn(() => false),
  getTaskTypeConfigCache: vi.fn(() => ({})),
}));

import {
  getTaskDisplayName,
  taskSupportsProgress,
  getVisibleTaskTypes,
  getHiddenTaskTypes,
  filterVisibleTasks,
} from '../taskConfig';

import {
  isTaskTypeConfigCacheInitialized,
  getTaskTypeConfigCache,
} from '@/shared/hooks/useTaskType';

const mockCacheInitialized = vi.mocked(isTaskTypeConfigCacheInitialized);
const mockGetCache = vi.mocked(getTaskTypeConfigCache);

describe('taskConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no DB cache
    mockCacheInitialized.mockReturnValue(false);
    mockGetCache.mockReturnValue({});
  });

  describe('getTaskDisplayName (hardcoded fallback)', () => {
    it('returns display name for known visible task types', () => {
      expect(getTaskDisplayName('travel_orchestrator')).toBe('Travel Between Images');
      expect(getTaskDisplayName('join_clips_orchestrator')).toBe('Join Clips');
      expect(getTaskDisplayName('edit_video_orchestrator')).toBe('Edit Video');
      expect(getTaskDisplayName('animate_character')).toBe('Animate Character');
    });

    it('returns the raw taskType for unknown types', () => {
      expect(getTaskDisplayName('some_unknown_type')).toBe('some_unknown_type');
    });

    it('returns the raw taskType for hidden types without display names', () => {
      // travel_segment has no displayName in hardcoded config
      expect(getTaskDisplayName('travel_segment')).toBe('travel_segment');
    });
  });

  describe('getTaskDisplayName (DB cache)', () => {
    it('uses DB cache when initialized', () => {
      mockCacheInitialized.mockReturnValue(true);
      mockGetCache.mockReturnValue({
        custom_task: {
          id: 'custom_task',
          display_name: 'Custom Task Display',
          is_visible: true,
          supports_progress: false,
          category: 'generation',
          variant_type: null,
        },
      } as any);

      expect(getTaskDisplayName('custom_task')).toBe('Custom Task Display');
    });

    it('falls back to hardcoded when task not in DB cache', () => {
      mockCacheInitialized.mockReturnValue(true);
      mockGetCache.mockReturnValue({});

      expect(getTaskDisplayName('travel_orchestrator')).toBe('Travel Between Images');
    });
  });

  describe('taskSupportsProgress', () => {
    it('returns true for orchestrator tasks', () => {
      expect(taskSupportsProgress('travel_orchestrator')).toBe(true);
      expect(taskSupportsProgress('join_clips_orchestrator')).toBe(true);
      expect(taskSupportsProgress('edit_video_orchestrator')).toBe(true);
    });

    it('returns false for non-orchestrator tasks', () => {
      expect(taskSupportsProgress('animate_character')).toBe(false);
      expect(taskSupportsProgress('single_image')).toBe(false);
    });

    it('returns false for unknown task types', () => {
      expect(taskSupportsProgress('totally_unknown')).toBe(false);
    });

    it('uses DB cache for progress support', () => {
      mockCacheInitialized.mockReturnValue(true);
      mockGetCache.mockReturnValue({
        new_orchestrator: {
          id: 'new_orchestrator',
          display_name: 'New Orchestrator',
          is_visible: true,
          supports_progress: true,
          category: 'orchestration',
          variant_type: null,
        },
      } as any);

      expect(taskSupportsProgress('new_orchestrator')).toBe(true);
    });
  });

  describe('getVisibleTaskTypes (hardcoded)', () => {
    it('returns all visible task types from hardcoded config', () => {
      const visible = getVisibleTaskTypes();

      expect(visible).toContain('travel_orchestrator');
      expect(visible).toContain('join_clips_orchestrator');
      expect(visible).toContain('edit_video_orchestrator');
      expect(visible).toContain('animate_character');
      expect(visible).toContain('video_enhance');
    });

    it('does not include hidden task types', () => {
      const visible = getVisibleTaskTypes();

      expect(visible).not.toContain('travel_segment');
      expect(visible).not.toContain('single_image');
      expect(visible).not.toContain('extract_frame');
    });
  });

  describe('getHiddenTaskTypes (hardcoded)', () => {
    it('returns all hidden task types', () => {
      const hidden = getHiddenTaskTypes();

      expect(hidden).toContain('travel_segment');
      expect(hidden).toContain('travel_stitch');
      expect(hidden).toContain('single_image');
      expect(hidden).toContain('extract_frame');
      expect(hidden).toContain('wgp');
    });

    it('does not include visible task types', () => {
      const hidden = getHiddenTaskTypes();

      expect(hidden).not.toContain('travel_orchestrator');
      expect(hidden).not.toContain('animate_character');
    });
  });

  describe('getVisibleTaskTypes / getHiddenTaskTypes (DB cache)', () => {
    it('uses DB cache when initialized', () => {
      mockCacheInitialized.mockReturnValue(true);
      mockGetCache.mockReturnValue({
        db_visible_task: {
          id: 'db_visible_task',
          display_name: 'DB Visible',
          is_visible: true,
          supports_progress: false,
          category: 'generation',
          variant_type: null,
        },
        db_hidden_task: {
          id: 'db_hidden_task',
          display_name: 'DB Hidden',
          is_visible: false,
          supports_progress: false,
          category: 'utility',
          variant_type: null,
        },
      } as any);

      const visible = getVisibleTaskTypes();
      const hidden = getHiddenTaskTypes();

      expect(visible).toContain('db_visible_task');
      expect(visible).not.toContain('db_hidden_task');
      expect(hidden).toContain('db_hidden_task');
      expect(hidden).not.toContain('db_visible_task');
    });
  });

  describe('filterVisibleTasks', () => {
    it('filters out hidden tasks', () => {
      const tasks = [
        { taskType: 'travel_orchestrator', id: '1' },
        { taskType: 'travel_segment', id: '2' },
        { taskType: 'animate_character', id: '3' },
        { taskType: 'extract_frame', id: '4' },
      ];

      const filtered = filterVisibleTasks(tasks);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((t) => t.taskType)).toEqual([
        'travel_orchestrator',
        'animate_character',
      ]);
    });

    it('returns empty array when all tasks are hidden', () => {
      const tasks = [
        { taskType: 'travel_segment', id: '1' },
        { taskType: 'extract_frame', id: '2' },
      ];

      expect(filterVisibleTasks(tasks)).toEqual([]);
    });

    it('returns all tasks when all are visible', () => {
      const tasks = [
        { taskType: 'travel_orchestrator', id: '1' },
        { taskType: 'animate_character', id: '2' },
      ];

      expect(filterVisibleTasks(tasks)).toHaveLength(2);
    });

    it('returns empty array for empty input', () => {
      expect(filterVisibleTasks([])).toEqual([]);
    });

    it('hides unknown task types by default', () => {
      const tasks = [
        { taskType: 'completely_unknown_type', id: '1' },
      ];

      expect(filterVisibleTasks(tasks)).toEqual([]);
    });
  });
});
